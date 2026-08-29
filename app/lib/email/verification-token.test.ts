import { describe, expect, it } from 'vitest';

import {
	buildVerificationUrl,
	generateVerificationToken,
	isVerificationTokenExpired,
	resolveAppUrl,
	VERIFICATION_TOKEN_TTL_MS,
	verificationTokenExpiry,
} from './verification-token';

const NOW = new Date('2026-08-29T12:00:00.000Z');

describe('generateVerificationToken', () => {
	it('returns 64 lowercase hex characters', () => {
		expect(generateVerificationToken()).toMatch(/^[0-9a-f]{64}$/);
	});

	it('does not repeat across calls', () => {
		const tokens = new Set(Array.from({ length: 200 }, generateVerificationToken));

		expect(tokens.size).toBe(200);
	});

	it('is URL-safe, so the link needs no escaping', () => {
		const token = generateVerificationToken();

		expect(encodeURIComponent(token)).toBe(token);
	});
});

describe('verificationTokenExpiry', () => {
	it('is 24 hours after the given moment', () => {
		expect(verificationTokenExpiry(NOW).toISOString()).toBe('2026-08-30T12:00:00.000Z');
	});

	it('uses the TTL constant the email copy promises', () => {
		expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
	});

	it('does not mutate the date it is given', () => {
		const now = new Date(NOW);
		verificationTokenExpiry(now);

		expect(now.toISOString()).toBe(NOW.toISOString());
	});
});

describe('isVerificationTokenExpired', () => {
	it('treats a missing expiry as expired', () => {
		// Rows written before this feature have no expiry and must not be trusted.
		expect(isVerificationTokenExpired(null, NOW)).toBe(true);
	});

	it('accepts a token one millisecond before its expiry', () => {
		expect(isVerificationTokenExpired(new Date(NOW.getTime() + 1), NOW)).toBe(false);
	});

	it('rejects a token exactly at its expiry', () => {
		expect(isVerificationTokenExpired(new Date(NOW), NOW)).toBe(true);
	});

	it('rejects a token past its expiry', () => {
		expect(isVerificationTokenExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
	});

	it('accepts a freshly issued token', () => {
		expect(isVerificationTokenExpired(verificationTokenExpiry(NOW), NOW)).toBe(false);
	});
});

describe('resolveAppUrl', () => {
	it('prefers APP_URL', () => {
		expect(resolveAppUrl({ APP_URL: 'https://app.example', AUTH_URL: 'https://auth.example' })).toBe(
			'https://app.example',
		);
	});

	it('falls back to AUTH_URL', () => {
		expect(resolveAppUrl({ AUTH_URL: 'https://auth.example' })).toBe('https://auth.example');
	});

	it('falls back to localhost when neither is set', () => {
		expect(resolveAppUrl({})).toBe('http://localhost:3000');
	});

	it('ignores an empty or whitespace-only value rather than building a relative link', () => {
		expect(resolveAppUrl({ APP_URL: '   ', AUTH_URL: 'https://auth.example' })).toBe('https://auth.example');
		expect(resolveAppUrl({ APP_URL: '' })).toBe('http://localhost:3000');
	});

	it('strips trailing slashes so the link never doubles one', () => {
		expect(resolveAppUrl({ APP_URL: 'https://app.example///' })).toBe('https://app.example');
	});
});

describe('buildVerificationUrl', () => {
	it('points at the verify route with the token as a query param', () => {
		expect(buildVerificationUrl('abc123', 'https://app.example')).toBe(
			'https://app.example/api/auth/verify-email?token=abc123',
		);
	});

	it('does not double a slash when the base carries one', () => {
		expect(buildVerificationUrl('abc123', 'https://app.example/')).toBe(
			'https://app.example/api/auth/verify-email?token=abc123',
		);
	});

	it('percent-encodes a token that would otherwise break the query string', () => {
		expect(buildVerificationUrl('a b&c=d', 'https://app.example')).toBe(
			'https://app.example/api/auth/verify-email?token=a+b%26c%3Dd',
		);
	});
});
