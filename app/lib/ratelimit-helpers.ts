import { Ratelimit } from '@upstash/ratelimit';
import { after } from 'next/server';
import { headers } from 'next/headers';

export interface RateLimitResult {
	limited: boolean;
	retryAfterSeconds: number;
}

const NOT_LIMITED: RateLimitResult = { limited: false, retryAfterSeconds: 0 };

export async function getIp(): Promise<string> {
	const headerList = await headers();

	const vercelIp = headerList.get('x-vercel-forwarded-for')?.trim();
	if (vercelIp) return vercelIp;

	const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
	if (forwarded) return forwarded;

	return headerList.get('x-real-ip')?.trim() || 'anonymous';
}

export async function checkRateLimit(limiter: Ratelimit | null, key: string): Promise<RateLimitResult> {
	if (!limiter) return NOT_LIMITED;

	try {
		const { success, reset, pending } = await limiter.limit(key);

		try {
			after(pending);
		} catch {}

		if (!success) {
			return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
		}

		return NOT_LIMITED;
	} catch (error) {
		console.error('[ratelimit] check failed — allowing the request through', error);

		return NOT_LIMITED;
	}
}

function pluralPl(n: number, one: string, few: string, many: string): string {
	if (n === 1) return one;

	const mod10 = n % 10;
	const mod100 = n % 100;

	if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;

	return many;
}

export function formatRetryAfter(seconds: number): string {
	if (seconds < 60) {
		return `${seconds} ${pluralPl(seconds, 'sekundę', 'sekundy', 'sekund')}`;
	}

	const minutes = Math.ceil(seconds / 60);

	return `${minutes} ${pluralPl(minutes, 'minutę', 'minuty', 'minut')}`;
}

export function rateLimitedResponse(message: string, retryAfterSeconds: number): Response {
	return Response.json({ error: message }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } });
}
