import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { resetPasswordRequestSchema } from '@/app/lib/auth.schema';
import { emailFromPasswordResetIdentifier, isPasswordResetTokenExpired } from '@/app/lib/email/password-reset-token';
import { prisma } from '@/app/lib/prisma';

/**
 * Consumes a reset link and sets the new password.
 *
 * A route handler rather than a server action for two reasons: the outcomes are
 * status codes the form branches on, and Next traces server-action arguments in
 * the dev console — a password submitted through an action is printed in
 * plaintext, which is exactly the bug `signInAction` still has.
 */

// Matches `prisma/seed.ts` and the register route. A reset that hashed at a
// different cost would still verify, but the drift would be invisible.
const BCRYPT_ROUNDS = 10;

const INVALID_TOKEN = 'Link jest nieprawidłowy lub wygasł. Poproś o nowy.';

export async function POST(request: Request) {
	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 });
	}

	const parsed = resetPasswordRequestSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{ error: 'Popraw zaznaczone pola', fieldErrors: z.flattenError(parsed.error).fieldErrors },
			{ status: 400 },
		);
	}

	const { token, password } = parsed.data;

	const record = await prisma.verificationToken.findUnique({ where: { token } });

	// The prefix check is what stops a token minted by some other flow through
	// this shared Auth.js table from being spent as a password reset.
	const email = record && emailFromPasswordResetIdentifier(record.identifier);

	if (!record || !email) {
		return Response.json({ error: INVALID_TOKEN }, { status: 400 });
	}

	if (isPasswordResetTokenExpired(record.expires, new Date())) {
		await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });

		return Response.json({ error: INVALID_TOKEN }, { status: 400 });
	}

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true, emailVerified: true },
	});

	if (!user) {
		await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } });

		return Response.json({ error: INVALID_TOKEN }, { status: 400 });
	}

	const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

	await prisma.$transaction([
		prisma.user.update({
			where: { id: user.id },
			data: {
				passwordHash,
				/**
				 * Opening the link proves control of the mailbox, which is the same
				 * thing the verification link proves. Without this an unverified user
				 * would reset their password and still be parked on `/verify-email`.
				 */
				emailVerified: user.emailVerified ?? new Date(),
			},
		}),
		// `deleteMany`, not `delete`: a double submit would make the second call
		// throw P2025 on a row the first already removed. Scoped to the identifier
		// so any other outstanding link for this address dies here too.
		prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } }),
	]);

	return Response.json({ ok: true });
}
