import { after } from 'next/server';
import { z } from 'zod';

import { forgotPasswordSchema } from '@/app/lib/auth.schema';
import { issuePasswordResetEmail } from '@/app/lib/email/issue-password-reset';
import { prisma } from '@/app/lib/prisma';
import { passwordResetLimiter } from '@/app/lib/ratelimit';
import { checkRateLimit, formatRetryAfter, getIp, rateLimitedResponse } from '@/app/lib/ratelimit-helpers';

/**
 * Requests a password reset link. Answers `200 { ok: true }` for every address
 * that parses — known, unknown, OAuth-only or unverified alike.
 *
 * That is the opposite of `/api/auth/register`, which answers 409 on a taken
 * address. Registration cannot both create the account and hide the collision;
 * this endpoint has no such excuse, so it must not become the enumeration oracle
 * the register route already is.
 *
 * "Identical" has to include *how long the answer takes*, which is why the send
 * is scheduled rather than awaited — see below.
 */
export async function POST(request: Request) {
	/**
	 * Keyed by IP, which is what keeps it compatible with the uniform answer
	 * above: the limiter can only ever reveal that *this caller* has asked too
	 * often, never whether the address they asked about exists. It runs on every
	 * request, so the added Redis round trip is identical on both branches and
	 * the timing equivalence the route depends on survives.
	 *
	 * Without it the endpoint mails an address of the caller's choosing on demand
	 * — a free spam relay pointed at anyone, and a fast way to burn the Resend
	 * domain reputation the real verification mail depends on.
	 */
	const { limited, retryAfterSeconds } = await checkRateLimit(passwordResetLimiter, await getIp());

	if (limited) {
		return rateLimitedResponse(`Spróbuj ponownie za ${formatRetryAfter(retryAfterSeconds)}.`, retryAfterSeconds);
	}

	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 });
	}

	const parsed = forgotPasswordSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{ error: 'Popraw zaznaczone pola', fieldErrors: z.flattenError(parsed.error).fieldErrors },
			{ status: 400 },
		);
	}

	const { email } = parsed.data;

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	/**
	 * An account with `passwordHash: null` is included on purpose. It signed up
	 * through Google, which verified this same mailbox, so whoever opens the link
	 * is the owner — and refusing would strand them behind a generic message that
	 * cannot explain why nothing arrived.
	 */
	if (user) {
		/**
		 * Scheduled, not awaited — and that is the whole point. The uniform 200
		 * below hides *whether* the address exists; awaiting a token mint plus a
		 * Resend round trip would put the same fact straight back on the wire as
		 * several hundred milliseconds of extra latency, which is every bit as
		 * readable as a different status code. `after` runs the send once the
		 * response has been flushed, so a known and an unknown address leave in
		 * the same time.
		 */
		after(async () => {
			try {
				await issuePasswordResetEmail(email);
			} catch (error) {
				// Swallowed, not surfaced: a 500 here would say "this address exists
				// and our mailer is down", which is half of what the generic answer
				// hides. The token is stored, and asking again mints a fresh one.
				console.error('[forgot-password] reset email failed', error);
			}
		});
	}

	return Response.json({ ok: true });
}
