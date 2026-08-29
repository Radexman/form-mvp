import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { registerSchema } from '@/app/lib/auth.schema';
import { isEmailVerificationEnabled } from '@/app/lib/email/config';
import { issueVerificationEmail } from '@/app/lib/email/issue-verification';
import { prisma } from '@/app/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

/**
 * Creates a credentials account. Sits at `/api/auth/register`, one segment
 * beside next-auth's `[...nextauth]` catch-all — the App Router matches the
 * static segment first, so this handler wins and everything else still falls
 * through to Auth.js.
 *
 * Registration does not sign anyone in. The client posts here and then sends
 * the user to the sign-in page, which is the flow Phase 3's register form is
 * specified to follow; issuing a session from a plain route handler would mean
 * minting a JWT outside Auth.js's own callbacks.
 */

// Matches `prisma/seed.ts`, so the seeded demo password and a freshly
// registered one are hashed identically.
const BCRYPT_ROUNDS = 10;

export async function POST(request: Request) {
	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 });
	}

	const parsed = registerSchema.safeParse(payload);

	if (!parsed.success) {
		// `fieldErrors` is keyed by field name, which is what Phase 3's form needs
		// to attach messages to inputs. `error` stays a plain sentence so a curl
		// caller gets something readable too.
		return Response.json(
			{
				error: 'Popraw zaznaczone pola',
				fieldErrors: z.flattenError(parsed.error).fieldErrors,
			},
			{ status: 400 },
		);
	}

	// `email` arrives trimmed and lowercased; `confirmPassword` has done its job
	// and is dropped here rather than carried any further.
	const { name, email, password } = parsed.data;

	const existing = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	/**
	 * Answers honestly that the address is taken, which leaks whether an account
	 * exists. Accepted: a registration endpoint cannot both create the account
	 * and hide the collision, and the alternative — a vague failure — leaves a
	 * user who simply forgot they had signed up with no way forward.
	 *
	 * What it must never do is attach a password to an *existing* account. That
	 * address may belong to a Google user with `passwordHash` null, and setting
	 * one from an unauthenticated request would hand their account to anyone who
	 * knows their email. Linking in that direction only goes the other way, via
	 * `allowDangerousEmailAccountLinking` on a verified Google sign-in.
	 */
	if (existing) {
		return Response.json({ error: 'Konto z tym adresem e-mail już istnieje' }, { status: 409 });
	}

	const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
	const verificationRequired = isEmailVerificationEnabled();

	try {
		const user = await prisma.user.create({
			data: {
				name,
				email,
				passwordHash,
				/**
				 * Stamped at creation when verification is off, and this is the single
				 * most important line in the feature. Skipping only the *send* would
				 * leave a population of `emailVerified: null` accounts that sign in
				 * fine today and are all locked out the moment the flag is switched
				 * on — the same failure `20260829130000_backfill_email_verified` had
				 * to repair for accounts that predated verification. Writing the stamp
				 * here means switching the flag on later never needs a backfill.
				 */
				emailVerified: verificationRequired ? null : new Date(),
			},
			select: { id: true, name: true, email: true },
		});

		// The account exists either way. A Resend outage must not turn into a 500
		// that tells the user registration failed — they would retry into a 409 on
		// their own address, with no way forward. The token is already stored, so
		// the re-send button on `/register/check-email` recovers it.
		let emailSent = false;

		if (verificationRequired) {
			emailSent = true;

			try {
				await issueVerificationEmail(user.id, user.email);
			} catch (error) {
				console.error('[register] verification email failed', error);
				emailSent = false;
			}
		} else if (process.env.NODE_ENV !== 'production') {
			// Answers the question this branch otherwise raises silently in dev:
			// the account was created and no email is coming.
			console.info('[register] EMAIL_VERIFICATION_ENABLED is off — account created already verified, no email sent');
		}

		// `verificationRequired` is what the client branches on: `emailSent: false`
		// alone is ambiguous between "verification is off" and "the send failed",
		// and those two need opposite next screens.
		return Response.json({ user, emailSent, verificationRequired }, { status: 201 });
	} catch (error) {
		// The check above is not atomic: two registrations for the same address can
		// both pass it and race into the unique index. P2002 is that race, and it
		// is the same answer as the check — not a server fault.
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
			return Response.json({ error: 'Konto z tym adresem e-mail już istnieje' }, { status: 409 });
		}

		throw error;
	}
}
