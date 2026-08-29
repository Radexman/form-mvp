import { prisma } from '@/app/lib/prisma';

import { sendVerificationEmail } from './send-verification-email';
import { generateVerificationToken, verificationTokenExpiry } from './verification-token';

/**
 * Mints a fresh token, stores it, and mails the link. Writing before sending
 * means a send failure leaves a usable token behind for the re-send button;
 * the reverse order could mail a link the database never learned about.
 */
export async function issueVerificationEmail(userId: string, email: string, now: Date = new Date()): Promise<void> {
	const token = generateVerificationToken();

	await prisma.user.update({
		where: { id: userId },
		data: {
			verificationToken: token,
			verificationTokenExpiresAt: verificationTokenExpiry(now),
		},
	});

	await sendVerificationEmail(email, token);
}
