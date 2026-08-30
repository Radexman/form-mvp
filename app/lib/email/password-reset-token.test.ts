import { describe, expect, it } from 'vitest';

import {
	buildPasswordResetUrl,
	emailFromPasswordResetIdentifier,
	generatePasswordResetToken,
	isPasswordResetIdentifier,
	isPasswordResetTokenExpired,
	PASSWORD_RESET_TOKEN_TTL_MS,
	passwordResetIdentifier,
	passwordResetTokenExpiry,
} from './password-reset-token';

const NOW = new Date('2026-08-30T12:00:00.000Z');

describe('generatePasswordResetToken', () => {
	it('returns 64 lowercase hex characters', () => {
		expect(generatePasswordResetToken()).toMatch(/^[0-9a-f]{64}$/);
	});

	it('does not repeat across calls', () => {
		const tokens = new Set(Array.from({ length: 200 }, generatePasswordResetToken));

		expect(tokens.size).toBe(200);
	});

	it('is URL-safe, so the link needs no escaping', () => {
		const token = generatePasswordResetToken();

		expect(encodeURIComponent(token)).toBe(token);
	});
});

describe('passwordResetTokenExpiry', () => {
	it('is one hour after the given moment', () => {
		expect(passwordResetTokenExpiry(NOW).toISOString()).toBe('2026-08-30T13:00:00.000Z');
	});

	it('uses the TTL the email copy promises', () => {
		expect(PASSWORD_RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
	});

	it('is far shorter than the verification link, which is the point', () => {
		expect(PASSWORD_RESET_TOKEN_TTL_MS).toBeLessThan(24 * 60 * 60 * 1000);
	});

	it('does not mutate the date it is given', () => {
		const now = new Date(NOW);
		passwordResetTokenExpiry(now);

		expect(now.toISOString()).toBe(NOW.toISOString());
	});
});

describe('isPasswordResetTokenExpired', () => {
	it('is false a minute before expiry', () => {
		expect(isPasswordResetTokenExpired(new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
	});

	it('is true a millisecond after expiry', () => {
		expect(isPasswordResetTokenExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
	});

	it('treats the exact expiry moment as expired', () => {
		expect(isPasswordResetTokenExpired(NOW, NOW)).toBe(true);
	});

	it('accepts a token minted right now', () => {
		expect(isPasswordResetTokenExpired(passwordResetTokenExpiry(NOW), NOW)).toBe(false);
	});
});

describe('passwordResetIdentifier', () => {
	it('namespaces the address', () => {
		expect(passwordResetIdentifier('jan@pasieka.pl')).toBe('password-reset:jan@pasieka.pl');
	});

	it('round-trips through the reader', () => {
		expect(emailFromPasswordResetIdentifier(passwordResetIdentifier('jan@pasieka.pl'))).toBe('jan@pasieka.pl');
	});

	it('is recognised by its own predicate', () => {
		expect(isPasswordResetIdentifier(passwordResetIdentifier('jan@pasieka.pl'))).toBe(true);
	});
});

describe('emailFromPasswordResetIdentifier', () => {
	// The row Auth.js's own email-link provider would write, if it were enabled.
	it('rejects a bare address, so an adapter token cannot be spent as a reset', () => {
		expect(emailFromPasswordResetIdentifier('jan@pasieka.pl')).toBeNull();
		expect(isPasswordResetIdentifier('jan@pasieka.pl')).toBe(false);
	});

	it('rejects a different namespace', () => {
		expect(emailFromPasswordResetIdentifier('magic-link:jan@pasieka.pl')).toBeNull();
	});

	it('rejects the prefix appearing anywhere but the start', () => {
		expect(emailFromPasswordResetIdentifier('x:password-reset:jan@pasieka.pl')).toBeNull();
	});

	it('returns an empty string, not null, for the bare prefix', () => {
		expect(emailFromPasswordResetIdentifier('password-reset:')).toBe('');
	});
});

describe('buildPasswordResetUrl', () => {
	it('points at the page, not an API route', () => {
		expect(buildPasswordResetUrl('abc', 'https://hivewise.app')).toBe('https://hivewise.app/reset-password?token=abc');
	});

	it('keeps a single slash when the base carries a trailing one', () => {
		expect(buildPasswordResetUrl('abc', 'https://hivewise.app/')).toBe('https://hivewise.app/reset-password?token=abc');
	});

	it('escapes a token that is not URL-safe', () => {
		expect(buildPasswordResetUrl('a b&c', 'https://hivewise.app')).toBe(
			'https://hivewise.app/reset-password?token=a+b%26c',
		);
	});

	it('works against a localhost base with a port', () => {
		expect(buildPasswordResetUrl('abc', 'http://localhost:3000')).toBe(
			'http://localhost:3000/reset-password?token=abc',
		);
	});
});
