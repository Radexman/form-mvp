import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ratelimit } from '@upstash/ratelimit';

/**
 * The helpers behind every limiter. Upstash itself is never contacted — what is
 * worth testing here is the glue: which header is trusted, what a blocked
 * result turns into, and that an infrastructure failure lets the request
 * through instead of taking auth down with it.
 *
 * `next/server` is faked because `after()` throws outside a request scope, and
 * `next/headers` because `headers()` has no meaning in a node suite.
 */
const mocks = vi.hoisted(() => ({
	after: vi.fn(),
	headers: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

const { checkRateLimit, formatRetryAfter, getIp, rateLimitedResponse } = await import('./ratelimit-helpers');

const NOW = new Date('2026-01-01T00:00:00Z');

/** A limiter whose `limit()` resolves to whatever the test needs. */
function limiterReturning(result: { success: boolean; reset?: number }): Ratelimit {
	return {
		limit: vi.fn().mockResolvedValue({
			success: result.success,
			reset: result.reset ?? 0,
			limit: 5,
			remaining: result.success ? 4 : 0,
			pending: Promise.resolve(),
		}),
	} as unknown as Ratelimit;
}

/** Stubs `headers()` with a fixed header set. */
function withHeaders(entries: Record<string, string>) {
	mocks.headers.mockResolvedValue({
		get: (name: string) => entries[name] ?? null,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('formatRetryAfter', () => {
	/**
	 * Polish picks between three forms, and the boundaries are not intuitive:
	 * 2-4 take the "few" ending, but 12-14 fall back to "many" while 22-24 do
	 * not. Getting this wrong is visible to every user who hits a limit.
	 */
	it.each([
		[0, '0 sekund'],
		[1, '1 sekundę'],
		[2, '2 sekundy'],
		[4, '4 sekundy'],
		[5, '5 sekund'],
		[12, '12 sekund'],
		[14, '14 sekund'],
		[22, '22 sekundy'],
		[25, '25 sekund'],
		[59, '59 sekund'],
	])('renders %i seconds as "%s"', (seconds, expected) => {
		expect(formatRetryAfter(seconds)).toBe(expected);
	});

	it.each([
		[60, '1 minutę'],
		[120, '2 minuty'],
		[300, '5 minut'],
		[720, '12 minut'],
		[1320, '22 minuty'],
		[1500, '25 minut'],
		[3600, '60 minut'],
	])('renders %i seconds as "%s"', (seconds, expected) => {
		expect(formatRetryAfter(seconds)).toBe(expected);
	});

	// Rounds up, never down: telling someone to retry sooner than the window
	// allows sends them straight back into the same rejection.
	it('rounds partial minutes up', () => {
		expect(formatRetryAfter(61)).toBe('2 minuty');
		expect(formatRetryAfter(3540)).toBe('59 minut');
	});
});

describe('checkRateLimit', () => {
	// The unconfigured case: `.env.example` ships the Upstash keys blank, so
	// every limiter is null on a fresh clone and nothing may break.
	it('allows the request when the limiter is null', async () => {
		await expect(checkRateLimit(null, 'ip')).resolves.toEqual({ limited: false, retryAfterSeconds: 0 });
	});

	it('allows the request when the limiter reports success', async () => {
		const limiter = limiterReturning({ success: true });

		await expect(checkRateLimit(limiter, '1.2.3.4')).resolves.toEqual({ limited: false, retryAfterSeconds: 0 });
		expect(limiter.limit).toHaveBeenCalledWith('1.2.3.4');
	});

	it('reports the wait in whole seconds when blocked', async () => {
		const limiter = limiterReturning({ success: false, reset: NOW.getTime() + 30_000 });

		await expect(checkRateLimit(limiter, 'ip')).resolves.toEqual({ limited: true, retryAfterSeconds: 30 });
	});

	it('rounds a partial second up', async () => {
		const limiter = limiterReturning({ success: false, reset: NOW.getTime() + 4200 });

		await expect(checkRateLimit(limiter, 'ip')).resolves.toEqual({ limited: true, retryAfterSeconds: 5 });
	});

	// A reset already in the past would otherwise render as "0 sekund", which
	// reads as a bug rather than an instruction.
	it('never reports less than one second', async () => {
		const limiter = limiterReturning({ success: false, reset: NOW.getTime() - 5000 });

		await expect(checkRateLimit(limiter, 'ip')).resolves.toEqual({ limited: true, retryAfterSeconds: 1 });
	});

	/**
	 * The deliberate fail-open. If Upstash is unreachable this must degrade to
	 * "no rate limiting", never to "nobody can sign in" — an outage in a
	 * defensive layer must not become an outage in authentication.
	 */
	it('lets the request through when the limiter throws', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const limiter = { limit: vi.fn().mockRejectedValue(new Error('upstash down')) } as unknown as Ratelimit;

		await expect(checkRateLimit(limiter, 'ip')).resolves.toEqual({ limited: false, retryAfterSeconds: 0 });
		expect(consoleError).toHaveBeenCalled();
	});

	// Analytics is best-effort. `after()` throwing for want of a request scope
	// must not turn a successful check into a failed request.
	it('survives after() throwing on the deferred analytics write', async () => {
		mocks.after.mockImplementationOnce(() => {
			throw new Error('no request scope');
		});

		await expect(checkRateLimit(limiterReturning({ success: true }), 'ip')).resolves.toEqual({
			limited: false,
			retryAfterSeconds: 0,
		});
	});
});

describe('getIp', () => {
	/**
	 * Precedence is the security-relevant part. `x-forwarded-for` is a list a
	 * client can prepend to if a proxy appends rather than replaces; the Vercel
	 * header is written by the platform and cannot be set by the caller, so it
	 * has to win. An identifier the caller chooses is no identifier at all.
	 */
	it('prefers the Vercel header over x-forwarded-for', async () => {
		withHeaders({ 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });

		await expect(getIp()).resolves.toBe('9.9.9.9');
	});

	it('falls back to the first x-forwarded-for entry', async () => {
		withHeaders({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });

		await expect(getIp()).resolves.toBe('1.1.1.1');
	});

	it('trims surrounding whitespace', async () => {
		withHeaders({ 'x-forwarded-for': '  1.1.1.1 , 2.2.2.2' });

		await expect(getIp()).resolves.toBe('1.1.1.1');
	});

	it('falls back to x-real-ip', async () => {
		withHeaders({ 'x-real-ip': '3.3.3.3' });

		await expect(getIp()).resolves.toBe('3.3.3.3');
	});

	// One shared bucket for callers we cannot identify, rather than a free pass
	// for anyone who strips the headers.
	it('returns a constant when no header identifies the caller', async () => {
		withHeaders({});

		await expect(getIp()).resolves.toBe('anonymous');
	});

	it('ignores an empty header value', async () => {
		withHeaders({ 'x-vercel-forwarded-for': '   ', 'x-forwarded-for': '1.1.1.1' });

		await expect(getIp()).resolves.toBe('1.1.1.1');
	});
});

describe('rateLimitedResponse', () => {
	it('answers 429 with the message and a Retry-After header', async () => {
		const response = rateLimitedResponse('Spróbuj ponownie za 5 minut.', 300);

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('300');
		await expect(response.json()).resolves.toEqual({ error: 'Spróbuj ponownie za 5 minut.' });
	});
});
