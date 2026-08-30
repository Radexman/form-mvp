import { randomBytes } from 'node:crypto';

import { resolveAppUrl } from './verification-token';

/** An hour, not the verification link's 24 — a reset link is a live credential. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Reset tokens share Auth.js's `VerificationToken` table, whose adapter writes a
 * bare email as `identifier` for magic-link sign-in. Nothing uses that provider
 * today; the prefix is what keeps the two kinds apart if it is ever enabled.
 */
const IDENTIFIER_PREFIX = 'password-reset:';

export function generatePasswordResetToken(): string {
	return randomBytes(32).toString('hex');
}

export function passwordResetTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);
}

export function isPasswordResetTokenExpired(expires: Date, now: Date): boolean {
	return expires.getTime() <= now.getTime();
}

export function passwordResetIdentifier(email: string): string {
	return `${IDENTIFIER_PREFIX}${email}`;
}

export function isPasswordResetIdentifier(identifier: string): boolean {
	return identifier.startsWith(IDENTIFIER_PREFIX);
}

export function emailFromPasswordResetIdentifier(identifier: string): string | null {
	return isPasswordResetIdentifier(identifier) ? identifier.slice(IDENTIFIER_PREFIX.length) : null;
}

/** Points at the page, not an API route: the user has a password to type first. */
export function buildPasswordResetUrl(token: string, baseUrl: string = resolveAppUrl()): string {
	const url = new URL('/reset-password', baseUrl);
	url.searchParams.set('token', token);

	return url.toString();
}
