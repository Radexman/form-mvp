import bcrypt from 'bcryptjs';

/**
 * The one bcrypt cost factor in the project.
 *
 * Every path that writes a `passwordHash` reads it from here — the register,
 * reset and change-password routes, `prisma/seed.ts` and
 * `prisma/create-account.ts`. Those five used to hold their own copy of the
 * number with a comment on each asking the next person to keep them in sync;
 * the comments were right that silent drift was the risk, and this is the fix
 * that makes drift impossible rather than merely discouraged.
 *
 * 12, where it used to be 10. OWASP gives 10 as the *minimum* for bcrypt, so
 * the old value was never a violation, but 12 is the current working figure and
 * each increment doubles what an offline run against a stolen table costs.
 *
 * It also doubles the cost of every sign-in attempt, which matters while the
 * auth endpoints are still unthrottled — that is the next feature, and this
 * number is one of the reasons it should not slip.
 */
export const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Whether a stored hash was written at a lower cost than the one above.
 *
 * bcrypt encodes its cost inside the hash, so raising `BCRYPT_ROUNDS` does not
 * invalidate anything already stored — an old hash keeps verifying, it just
 * keeps its old, weaker cost until something rewrites it. Nothing can rewrite
 * it without the plaintext, and the only moment the plaintext is legitimately
 * in hand is a successful sign-in, which is where `authorize` calls this.
 */
export function needsRehash(hash: string): boolean {
	return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
}

/**
 * Whether a session token is spent because the password was written after it
 * was issued. `auth.ts`'s `jwt` callback is the only caller.
 *
 * Extracted rather than left inline for the reason `profile.ts` extracts its
 * derivations: a function nested inside a config object cannot be unit-tested,
 * and the branches here are the ones worth pinning down — no stamp at all, a
 * token that predates the column, a token issued in the same millisecond as the
 * change.
 */
export function isSessionRevoked(tokenIssuedAt: number | undefined, passwordChangedAt: Date | null): boolean {
	// Null revokes nothing. It means the account has not had a password written
	// since the column landed, which is true of every account that predates it —
	// reading that as "changed at the epoch" would sign all of them out at once.
	if (!passwordChangedAt) {
		return false;
	}

	// A token with no stamp predates the feature, so it counts as issued at 0:
	// older than any real change, and therefore spent the moment one happens.
	return (tokenIssuedAt ?? 0) < passwordChangedAt.getTime();
}
