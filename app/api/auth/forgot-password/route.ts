import { z } from 'zod';

import { forgotPasswordSchema } from '@/app/lib/auth.schema';
import { issuePasswordResetEmail } from '@/app/lib/email/issue-password-reset';
import { prisma } from '@/app/lib/prisma';

/**
 * Requests a password reset link. Answers `200 { ok: true }` for every address
 * that parses — known, unknown, OAuth-only or unverified alike.
 *
 * That is the opposite of `/api/auth/register`, which answers 409 on a taken
 * address. Registration cannot both create the account and hide the collision;
 * this endpoint has no such excuse, so it must not become the enumeration oracle
 * the register route already is.
 */
export async function POST(request: Request) {
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
		try {
			await issuePasswordResetEmail(email);
		} catch (error) {
			// Swallowed, not surfaced: a 500 here would say "this address exists and
			// our mailer is down", which is half of what the generic answer hides.
			// The token is stored, and asking again mints a fresh one.
			console.error('[forgot-password] reset email failed', error);
		}
	}

	return Response.json({ ok: true });
}
