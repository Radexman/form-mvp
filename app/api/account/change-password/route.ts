import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { auth } from '@/auth';
import { changePasswordSchema } from '@/app/lib/auth.schema';
import { passwordResetIdentifier } from '@/app/lib/email/password-reset-token';
import { hashPassword } from '@/app/lib/password';
import { prisma } from '@/app/lib/prisma';

/**
 * Changes the signed-in user's password, given their current one.
 *
 * A route handler rather than a server action, like the reset endpoint beside
 * it: the form branches on status codes, and Next traces server-action
 * arguments in the dev console — a password submitted through an action is
 * printed there in plaintext.
 */

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user?.id) {
		return Response.json({ error: 'Musisz być zalogowany' }, { status: 401 });
	}

	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return Response.json({ error: 'Nieprawidłowe żądanie' }, { status: 400 });
	}

	const parsed = changePasswordSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{ error: 'Popraw zaznaczone pola', fieldErrors: z.flattenError(parsed.error).fieldErrors },
			{ status: 400 },
		);
	}

	const { currentPassword, password } = parsed.data;

	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { passwordHash: true },
	});

	// A JWT outlives the row it names, so a session can point at a user that was
	// deleted (from another tab, or by this very feature) since it was issued.
	if (!user) {
		return Response.json({ error: 'Musisz być zalogowany' }, { status: 401 });
	}

	/**
	 * An OAuth-only account has no current password to prove, so there is nothing
	 * this endpoint can check. Such a user sets a password through the reset
	 * flow, which proves control of the mailbox instead. The UI hides the form in
	 * this case; the endpoint is still reachable, hence the check.
	 */
	if (!user.passwordHash) {
		return Response.json(
			{ error: 'To konto nie ma hasła. Ustaw je przez „Nie pamiętasz hasła?” na stronie logowania.' },
			{ status: 409 },
		);
	}

	if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
		// Keyed to the field so it lands on the input the user can fix. Naming the
		// wrong field leaks nothing here — the session already proves who they are.
		return Response.json(
			{ error: 'Popraw zaznaczone pola', fieldErrors: { currentPassword: ['Nieprawidłowe hasło'] } },
			{ status: 400 },
		);
	}

	await prisma.user.update({
		where: { id: session.user.id },
		data: {
			passwordHash: await hashPassword(password),
			/**
			 * Every session issued before this moment stops working — see the `jwt`
			 * callback in `auth.ts`. This is the point of the endpoint: someone
			 * changing their password because they think it is known is trying to
			 * evict whoever knows it, and until now the old cookie kept working for
			 * up to the JWT's full lifetime.
			 *
			 * It also evicts *this* browser, which cannot be helped — a JWT carries
			 * nothing that distinguishes the session making the request from any
			 * other. `ChangePasswordForm` signs out and redirects on success so that
			 * lands as an explained "sign in again" rather than a silent bounce.
			 */
			passwordChangedAt: new Date(),
		},
	});

	/**
	 * Outstanding reset links are dropped along with the old password. Someone
	 * changing their password because they suspect it is known must not leave a
	 * live link in a mailbox that sets it back.
	 *
	 * The email is read from the session rather than the row above: it is the
	 * same value, and the identifier namespace is built from an address.
	 */
	if (session.user.email) {
		await prisma.verificationToken.deleteMany({
			where: { identifier: passwordResetIdentifier(session.user.email.toLowerCase()) },
		});
	}

	return Response.json({ ok: true });
}
