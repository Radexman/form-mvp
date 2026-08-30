import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The delete endpoint's guard sequence.
 *
 * The first suite in this repo to mock a module: every handler branch here ends
 * in either "the account is gone" or "it is not", and the branches that must
 * *not* delete are the whole reason the endpoint has guards. Only a fake Prisma
 * can assert that `user.delete` was never reached — a live run proves the
 * account survived, not that the code declined to try.
 */
const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	prisma: {
		user: { findUnique: vi.fn(), delete: vi.fn() },
		verificationToken: { deleteMany: vi.fn() },
		$transaction: vi.fn(),
	},
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/app/lib/prisma', () => ({ prisma: mocks.prisma }));

const { POST } = await import('./route');

const SESSION = { user: { id: 'user-1', email: 'jan@pasieka.pl' } };

/** No subscription, so nothing blocks — the ordinary account. */
const PLAIN_USER = { email: 'jan@pasieka.pl', subscription: null };

function post(body: unknown) {
	return POST(
		new Request('http://localhost/api/account/delete', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
	);
}

function confirmed() {
	return post({ confirmation: 'DeleteMyAccount' });
}

beforeEach(() => {
	// `restoreMocks` in vitest.config.mts restores spies; it does not reset the
	// call history of a bare `vi.fn()`, which every "did not delete" assertion
	// here depends on.
	vi.clearAllMocks();

	mocks.auth.mockResolvedValue(SESSION);
	mocks.prisma.user.findUnique.mockResolvedValue(PLAIN_USER);
	mocks.prisma.user.delete.mockResolvedValue({});
	mocks.prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
	mocks.prisma.$transaction.mockResolvedValue([]);
});

describe('POST /api/account/delete — refusals', () => {
	it('401s with no session, without touching the database', async () => {
		mocks.auth.mockResolvedValue(null);

		const response = await confirmed();

		expect(response.status).toBe(401);
		expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	// A session whose token carries no id is as good as no session.
	it('401s on a session with no user id', async () => {
		mocks.auth.mockResolvedValue({ user: {} });

		expect((await confirmed()).status).toBe(401);
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	it('400s on a malformed body', async () => {
		const response = await post('not json at all');

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Nieprawidłowe żądanie' });
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	it('400s on a missing confirmation', async () => {
		const response = await post({});

		expect(response.status).toBe(400);
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	/**
	 * The safeguard the dialog cannot provide. Anyone can call this endpoint
	 * without ever opening the dialog, so the phrase has to be re-checked here.
	 */
	it.each([
		['wrong case', 'deletemyaccount'],
		['a partial phrase', 'Delete'],
		['a spaced-out phrase', 'Delete My Account'],
		['a phrase with a suffix', 'DeleteMyAccount!'],
	])('400s on %s and does not delete', async (_label, confirmation) => {
		const response = await post({ confirmation });

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Popraw zaznaczone pola',
			fieldErrors: { confirmation: ['Wpisz dokładnie „DeleteMyAccount”'] },
		});
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	/**
	 * The one state that blocks deletion — deliberately narrower than
	 * `tier === 'PREMIUM'`, which is why the tier is not even selected.
	 */
	it('409s for a genuinely billed subscription and does not delete', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({
			email: 'jan@pasieka.pl',
			subscription: { status: 'active', stripeSubscriptionId: 'sub_123' },
		});

		const response = await confirmed();

		expect(response.status).toBe(409);
		expect((await response.json()).error).toContain('Anuluj ją');
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});

	/**
	 * The state every Premium row is in today: the seed writes `status: 'active'`
	 * and leaves the Stripe columns null. If this ever starts blocking, the demo
	 * account is trapped.
	 */
	it('deletes a seeded Premium account, which has no Stripe id', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({
			email: 'jan@pasieka.pl',
			subscription: { status: 'active', stripeSubscriptionId: null },
		});

		expect((await confirmed()).status).toBe(200);
		expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
	});
});

describe('POST /api/account/delete — deletion', () => {
	it('deletes the user and answers ok', async () => {
		const response = await confirmed();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
		expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
	});

	/**
	 * `VerificationToken` has no relation to `User`, so cascade does not reach it.
	 * Both namespaces go — the `password-reset:` one this app writes and the bare
	 * address the Auth.js adapter would write — or a token outlives the account
	 * and stays spendable if the address is registered again.
	 */
	it('takes every token for the address with it', async () => {
		await confirmed();

		expect(mocks.prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
			where: { identifier: { in: ['password-reset:jan@pasieka.pl', 'jan@pasieka.pl'] } },
		});
	});

	// `User.email` is stored lowercased, but the identifiers are built by string
	// concatenation, so a stray capital would silently miss every token.
	it('lowercases the address before building the identifiers', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue({ email: 'Jan@Pasieka.PL', subscription: null });

		await confirmed();

		expect(mocks.prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
			where: { identifier: { in: ['password-reset:jan@pasieka.pl', 'jan@pasieka.pl'] } },
		});
	});

	it('accepts a phrase padded by a paste or a mobile keyboard', async () => {
		const response = await post({ confirmation: '  DeleteMyAccount\n' });

		expect(response.status).toBe(200);
		expect(mocks.prisma.user.delete).toHaveBeenCalled();
	});

	/**
	 * A JWT outlives the row it names, so a double submit or a second tab can
	 * reach this with the account already gone. That is the requested state, not
	 * a failure — answering ok lets the client finish signing out.
	 */
	it('answers ok when the account is already gone, without deleting again', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue(null);

		const response = await confirmed();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});
});
