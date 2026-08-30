import bcrypt from 'bcryptjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The change-password endpoint's guard sequence.
 *
 * bcrypt is deliberately *not* mocked: the whole endpoint turns on whether the
 * current password verifies and whether the stored hash afterwards is the new
 * one, and a faked `compare` would assert nothing about either. Only `auth` and
 * Prisma are faked.
 */
const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	prisma: {
		user: { findUnique: vi.fn(), update: vi.fn() },
		verificationToken: { deleteMany: vi.fn() },
	},
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/app/lib/prisma', () => ({ prisma: mocks.prisma }));

const { POST } = await import('./route');

const SESSION = { user: { id: 'user-1', email: 'jan@pasieka.pl' } };

const CURRENT = 'StareHaslo9Tutaj';
const NEXT = 'Bezpieczne9Klucz';

let currentHash: string;

function post(body: unknown) {
	return POST(
		new Request('http://localhost/api/account/change-password', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
	);
}

function change(overrides: Record<string, unknown> = {}) {
	return post({ currentPassword: CURRENT, password: NEXT, confirmPassword: NEXT, ...overrides });
}

/** The hash the update was called with, or undefined when it never was. */
function writtenHash(): string | undefined {
	return mocks.prisma.user.update.mock.calls[0]?.[0]?.data?.passwordHash;
}

beforeAll(async () => {
	currentHash = await bcrypt.hash(CURRENT, 10);
});

beforeEach(() => {
	// See the note in the delete suite: `restoreMocks` does not clear a `vi.fn()`.
	vi.clearAllMocks();

	mocks.auth.mockResolvedValue(SESSION);
	mocks.prisma.user.findUnique.mockResolvedValue({ passwordHash: currentHash });
	mocks.prisma.user.update.mockResolvedValue({});
	mocks.prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('POST /api/account/change-password — refusals', () => {
	it('401s with no session, without touching the database', async () => {
		mocks.auth.mockResolvedValue(null);

		expect((await change()).status).toBe(401);
		expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	// A JWT outlives the row it names — including a row this feature's own delete
	// endpoint removed from another tab.
	it('401s when the session names a row that is gone', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue(null);

		expect((await change()).status).toBe(401);
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	it('400s on a malformed body', async () => {
		const response = await post('not json at all');

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Nieprawidłowe żądanie' });
	});

	it('400s with field errors on a weak new password', async () => {
		const response = await change({ password: 'krotkie', confirmPassword: 'krotkie' });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fieldErrors.password.length).toBeGreaterThan(0);
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	it('400s when the confirmation does not match', async () => {
		const response = await change({ confirmPassword: 'InneHaslo9Tutaj' });

		expect(response.status).toBe(400);
		expect((await response.json()).fieldErrors.confirmPassword).toEqual(['Hasła nie są identyczne']);
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	/**
	 * An OAuth-only account has no current password to prove. The page hides the
	 * form, but the endpoint is reachable regardless, so it refuses on its own and
	 * points at the flow that *can* set one.
	 */
	it('409s for an account with no password at all', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({ passwordHash: null });

		const response = await change();

		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('Nie pamiętasz hasła?');
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	it('400s on the current-password field when it is wrong', async () => {
		const response = await change({ currentPassword: 'ZupelnieInne9Slowo' });

		expect(response.status).toBe(400);
		expect((await response.json()).fieldErrors).toEqual({ currentPassword: ['Nieprawidłowe hasło'] });
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});

	// Otherwise a "change" that changes nothing reports success.
	it('400s when the new password equals the current one', async () => {
		const response = await change({ password: CURRENT, confirmPassword: CURRENT });

		expect(response.status).toBe(400);
		expect((await response.json()).fieldErrors.password).toContain('Nowe hasło musi różnić się od aktualnego');
		expect(mocks.prisma.user.update).not.toHaveBeenCalled();
	});
});

describe('POST /api/account/change-password — success', () => {
	it('stores a hash of the new password, not the old one', async () => {
		const response = await change();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });

		const stored = writtenHash()!;

		expect(await bcrypt.compare(NEXT, stored)).toBe(true);
		expect(await bcrypt.compare(CURRENT, stored)).toBe(false);
	});

	// Cost 10 everywhere — the seed, the register route and the reset route all
	// agree, and drift would be invisible because any cost still verifies.
	it('hashes at cost 10', async () => {
		await change();

		expect(writtenHash()).toMatch(/^\$2[aby]\$10\$/);
	});

	it('updates the signed-in user and nobody else', async () => {
		await change();

		expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
	});

	/**
	 * A password changed because it is feared known must not leave a live reset
	 * link in a mailbox that sets it back.
	 */
	it('drops outstanding reset links for the address', async () => {
		await change();

		expect(mocks.prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
			where: { identifier: 'password-reset:jan@pasieka.pl' },
		});
	});

	it('lowercases the address before building the identifier', async () => {
		mocks.auth.mockResolvedValue({ user: { id: 'user-1', email: 'Jan@Pasieka.PL' } });

		await change();

		expect(mocks.prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
			where: { identifier: 'password-reset:jan@pasieka.pl' },
		});
	});

	// The password still changes; there is simply no address to key tokens by.
	it('still changes the password when the session carries no address', async () => {
		mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });

		expect((await change()).status).toBe(200);
		expect(mocks.prisma.user.update).toHaveBeenCalled();
		expect(mocks.prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
	});
});
