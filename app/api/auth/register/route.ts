import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { registerSchema } from '@/app/lib/auth.schema';
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

	try {
		const user = await prisma.user.create({
			data: { name, email, passwordHash },
			select: { id: true, name: true, email: true },
		});

		return Response.json({ user }, { status: 201 });
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
