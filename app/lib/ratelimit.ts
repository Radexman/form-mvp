import { Ratelimit, type Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.NODE_ENV === 'production') {
	console.warn(
		'[ratelimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — ' +
			'every limiter is disabled and auth endpoints are unthrottled',
	);
}

function createLimiter(prefix: string, requests: number, window: Duration): Ratelimit | null {
	if (!redis) return null;

	return new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(requests, window),
		prefix,
		analytics: true,
		ephemeralCache: new Map(),
	});
}

export const loginLimiter = createLimiter('rl:login', 5, '1 m');
export const registerLimiter = createLimiter('rl:register', 3, '10 m');
export const resendVerificationLimiter = createLimiter('rl:resend-verify', 3, '10 m');
export const passwordResetLimiter = createLimiter('rl:password-reset', 3, '10 m');
export const passwordResetSubmitLimiter = createLimiter('rl:password-reset-submit', 10, '10 m');
export const pdfLimiter = createLimiter('rl:pdf', 20, '1 h');
