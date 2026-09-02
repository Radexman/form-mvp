'use server';

import { after } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

import { isEmailVerificationEnabled } from './config';
import { issueVerificationEmail } from './issue-verification';

export interface ResendResult {
	ok: boolean;
	message: string;
}

const SENT = 'Wysłaliśmy nowy link aktywacyjny. Sprawdź swoją skrzynkę.';
const FAILED = 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.';
const DISABLED = 'Potwierdzanie adresu e-mail jest obecnie wyłączone.';

/**
 * Both actions check the flag themselves rather than trusting their pages to
 * have redirected. A server action is reachable by anyone who has its `$ACTION_ID`
 * — from a stale tab open across the flip, or lifted out of the page source —
 * so the pages' redirects hide the button but do not disable the endpoint.
 */

/**
 * Re-sends to the address on the *session*, never to one supplied by the
 * caller — an action that mails whatever address it is handed is an open relay
 * for anyone who can read the action id out of the page.
 */
export async function resendVerificationAction(): Promise<ResendResult> {
	if (!isEmailVerificationEnabled()) {
		return { ok: false, message: DISABLED };
	}

	const session = await auth();

	if (!session?.user?.id) {
		return { ok: false, message: 'Zaloguj się, aby wysłać link ponownie.' };
	}

	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { id: true, email: true, emailVerified: true },
	});

	if (!user) {
		return { ok: false, message: FAILED };
	}

	if (user.emailVerified) {
		return { ok: true, message: 'Ten adres jest już potwierdzony.' };
	}

	try {
		await issueVerificationEmail(user.id, user.email);
	} catch (error) {
		console.error('[verify-email] resend failed', error);
		return { ok: false, message: FAILED };
	}

	return { ok: true, message: SENT };
}

/**
 * The `/register/check-email` variant. That page is reached signed out, so the
 * address comes from the query string — but it only ever mails an account that
 * exists and is still unverified, and answers identically either way so the
 * page cannot be used to test which addresses are registered.
 *
 * Identical in *timing* as well as in wording: the send is scheduled, not
 * awaited. See the comment on it below.
 */
export async function resendVerificationForEmailAction(email: string): Promise<ResendResult> {
	if (!isEmailVerificationEnabled()) {
		return { ok: false, message: DISABLED };
	}

	const normalised = email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email: normalised },
		select: { id: true, email: true, emailVerified: true, passwordHash: true },
	});

	if (user && !user.emailVerified && user.passwordHash) {
		/**
		 * Scheduled rather than awaited, for the reason `/api/auth/forgot-password`
		 * schedules its send: an identical message is only half the answer if one
		 * branch takes a Resend round trip longer than the other. The oracle here
		 * would be the sharper of the two — a slow reply means the address exists
		 * *and* is unverified *and* has a password.
		 *
		 * The cost is that a failed send can no longer be reported, so `FAILED` is
		 * unreachable on this path and the result below is unconditional. That is
		 * the same trade the forgot-password route already makes: the token is
		 * stored before the send, so pressing the button again mints a fresh one.
		 */
		after(async () => {
			try {
				await issueVerificationEmail(user.id, user.email);
			} catch (error) {
				console.error('[check-email] resend failed', error);
			}
		});
	}

	return { ok: true, message: SENT };
}
