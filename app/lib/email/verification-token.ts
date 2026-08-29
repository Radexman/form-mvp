import { randomBytes } from 'node:crypto';

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** 32 bytes of CSPRNG output, hex-encoded — 64 chars, safe to put in a URL as-is. */
export function generateVerificationToken(): string {
	return randomBytes(32).toString('hex');
}

export function verificationTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS);
}

export function isVerificationTokenExpired(expiresAt: Date | null, now: Date): boolean {
	// A token with no recorded expiry predates this feature and is not trusted.
	return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

/**
 * Server-only. `APP_URL` is not `NEXT_PUBLIC_` because the link is built inside
 * the send helper and never reaches the browser bundle.
 */
export function resolveAppUrl(env: Record<string, string | undefined> = process.env): string {
	const configured = env.APP_URL?.trim() || env.AUTH_URL?.trim();

	return (configured ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export function buildVerificationUrl(token: string, baseUrl: string = resolveAppUrl()): string {
	const url = new URL('/api/auth/verify-email', baseUrl);
	url.searchParams.set('token', token);

	return url.toString();
}
