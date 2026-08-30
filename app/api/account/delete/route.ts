import { z } from 'zod';

import { auth } from '@/auth';
import { deleteAccountSchema } from '@/app/lib/auth.schema';
import { passwordResetIdentifier } from '@/app/lib/email/password-reset-token';
import { prisma } from '@/app/lib/prisma';
import { DELETE_CONFIRMATION_PHRASE, hasBillableSubscription, isDeleteConfirmed } from '@/app/lib/profile';

/**
 * Deletes the signed-in user's account and everything hanging off it.
 *
 * The client signs out afterwards. It has to: sessions are JWTs, so the cookie
 * survives the row it names and nothing server-side can revoke it.
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

	const parsed = deleteAccountSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{ error: 'Popraw zaznaczone pola', fieldErrors: z.flattenError(parsed.error).fieldErrors },
			{ status: 400 },
		);
	}

	// Re-checked here and not only in the dialog: the endpoint is reachable by
	// anyone who can make a request, and the typed phrase is the whole safeguard.
	if (!isDeleteConfirmed(parsed.data.confirmation)) {
		return Response.json(
			{
				error: 'Popraw zaznaczone pola',
				fieldErrors: { confirmation: [`Wpisz dokładnie „${DELETE_CONFIRMATION_PHRASE}”`] },
			},
			{ status: 400 },
		);
	}

	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: {
			email: true,
			subscription: { select: { status: true, stripeSubscriptionId: true } },
		},
	});

	// Already gone — another tab, or a double submit. Answering ok lets the
	// client finish the flow it started rather than showing a failure for a
	// state that is exactly what was asked for.
	if (!user) {
		return Response.json({ ok: true });
	}

	/**
	 * The only thing that blocks deletion, and it is deliberately narrower than
	 * `tier === 'PREMIUM'` — see `hasBillableSubscription`. Nothing satisfies it
	 * until Stripe lands in Phase 4, so no account is trapped today.
	 */
	if (hasBillableSubscription(user.subscription)) {
		return Response.json(
			{ error: 'Masz aktywną subskrypcję Premium. Anuluj ją, zanim usuniesz konto.' },
			{ status: 409 },
		);
	}

	/**
	 * `onDelete: Cascade` carries the rest: `Account`, `Session`, `Subscription`,
	 * `UsagePeriod`, `AiReport`, and `Apiary` → `Hive` → `Inspection` →
	 * `PdfGenerationJob`.
	 *
	 * `VerificationToken` is the exception — it is keyed by an `identifier`
	 * string with no relation to `User`, so an outstanding link would survive the
	 * delete and still be spendable if the address is ever registered again.
	 *
	 * Both namespaces go: the `password-reset:` one this app writes, and the bare
	 * address `@auth/prisma-adapter` would write for a magic link. A *failed*
	 * reset deliberately leaves another flow's token alone, but erasing the
	 * account is the one operation that should take everything tied to the
	 * address with it.
	 */
	const email = user.email.toLowerCase();

	await prisma.$transaction([
		prisma.verificationToken.deleteMany({
			where: { identifier: { in: [passwordResetIdentifier(email), email] } },
		}),
		prisma.user.delete({ where: { id: session.user.id } }),
	]);

	return Response.json({ ok: true });
}
