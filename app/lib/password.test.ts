import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';

import { BCRYPT_ROUNDS, hashPassword, isSessionRevoked, needsRehash } from './password';

const PASSWORD = 'Bezpieczne9Klucz';

// Hashing at the real cost is deliberately slow, so the shared fixtures are
// built once rather than per test.
let current: string;
let older: string;

beforeAll(async () => {
	current = await hashPassword(PASSWORD);
	older = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS - 1);
});

describe('BCRYPT_ROUNDS', () => {
	/**
	 * A floor, not an equality check: raising the cost later is the point, and a
	 * test that pins the exact number would just have to be edited alongside it.
	 * 10 is OWASP's stated minimum for bcrypt, so dropping below it is the change
	 * worth failing on.
	 */
	it('is at least the OWASP minimum of 10', () => {
		expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(10);
	});
});

describe('hashPassword', () => {
	it('produces a hash the plaintext verifies against', async () => {
		expect(await bcrypt.compare(PASSWORD, current)).toBe(true);
	});

	it('does not verify a different password', async () => {
		expect(await bcrypt.compare('StareHaslo9Tutaj', current)).toBe(false);
	});

	it('hashes at the shared cost factor', () => {
		expect(bcrypt.getRounds(current)).toBe(BCRYPT_ROUNDS);
	});

	it('salts, so the same password twice gives different hashes', async () => {
		expect(await hashPassword(PASSWORD)).not.toBe(current);
	});
});

describe('needsRehash', () => {
	it('is false for a hash written at the current cost', () => {
		expect(needsRehash(current)).toBe(false);
	});

	it('is true for a hash written at a lower cost', () => {
		expect(needsRehash(older)).toBe(true);
	});

	/**
	 * The property the upgrade path depends on: raising the cost must not
	 * invalidate anything already stored, or every existing account would be
	 * locked out by the deploy rather than migrated by it.
	 */
	it('does not stop the older hash from verifying', async () => {
		expect(await bcrypt.compare(PASSWORD, older)).toBe(true);
	});
});

describe('isSessionRevoked', () => {
	const CHANGED = new Date('2026-09-02T12:00:00.000Z');

	it('revokes a token issued before the password changed', () => {
		expect(isSessionRevoked(CHANGED.getTime() - 1, CHANGED)).toBe(true);
	});

	it('keeps a token issued after the password changed', () => {
		expect(isSessionRevoked(CHANGED.getTime() + 1, CHANGED)).toBe(false);
	});

	// The sign-in that immediately follows a change can land in the same
	// millisecond, and signing that user straight back out would be a loop.
	it('keeps a token issued in the same millisecond', () => {
		expect(isSessionRevoked(CHANGED.getTime(), CHANGED)).toBe(false);
	});

	/**
	 * Every account that predates the column has a null stamp. Reading that as
	 * "changed at the epoch" would sign the entire user base out on deploy.
	 */
	it('revokes nothing when the password has never been changed', () => {
		expect(isSessionRevoked(0, null)).toBe(false);
		expect(isSessionRevoked(undefined, null)).toBe(false);
	});

	// A token minted before this feature carries no stamp of its own, so it is
	// older than any real change — but only once a change has actually happened.
	it('revokes an unstamped token once the password has changed', () => {
		expect(isSessionRevoked(undefined, CHANGED)).toBe(true);
	});
});
