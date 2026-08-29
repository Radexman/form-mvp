'use server';

import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';

import { issueVerificationEmail } from './issue-verification';

export interface ResendResult {
	ok: boolean;
	message: string;
}

const SENT = 'Wysłaliśmy nowy link aktywacyjny. Sprawdź swoją skrzynkę.';
const FAILED = 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.';

/**
 * Re-sends to the address on the *session*, never to one supplied by the
 * caller — an action that mails whatever address it is handed is an open relay
 * for anyone who can read the action id out of the page.
 */
export async function resendVerificationAction(): Promise<ResendResult> {
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
 */
export async function resendVerificationForEmailAction(email: string): Promise<ResendResult> {
	const normalised = email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email: normalised },
		select: { id: true, email: true, emailVerified: true, passwordHash: true },
	});

	if (user && !user.emailVerified && user.passwordHash) {
		try {
			await issueVerificationEmail(user.id, user.email);
		} catch (error) {
			console.error('[check-email] resend failed', error);
			return { ok: false, message: FAILED };
		}
	}

	return { ok: true, message: SENT };
}
