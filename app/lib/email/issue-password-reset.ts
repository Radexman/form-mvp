import { prisma } from '@/app/lib/prisma';

import { generatePasswordResetToken, passwordResetIdentifier, passwordResetTokenExpiry } from './password-reset-token';
import { sendPasswordResetEmail } from './send-password-reset-email';

/**
 * Mints a reset token, stores it, and mails the link. Written before it is sent,
 * like `issueVerificationEmail` — the reverse order could mail a link the
 * database never learned about.
 */
export async function issuePasswordResetEmail(email: string, now: Date = new Date()): Promise<void> {
	const identifier = passwordResetIdentifier(email);
	const token = generatePasswordResetToken();

	// Exactly one live link per address: an earlier email must stop working the
	// moment a new one is requested, which is the whole point of asking again.
	await prisma.$transaction([
		prisma.verificationToken.deleteMany({ where: { identifier } }),
		prisma.verificationToken.create({
			data: { identifier, token, expires: passwordResetTokenExpiry(now) },
		}),
	]);

	await sendPasswordResetEmail(email, token);
}
