import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ResendVerificationButton } from '@/app/components/auth/ResendVerificationButton';
import { SignOutButton } from '@/app/components/auth/SignOutButton';
import { MailIcon } from '@/app/components/dashboard/icons';
import { resendVerificationAction } from '@/app/lib/email/verification-actions';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export const metadata: Metadata = {
	title: 'Potwierdź e-mail · Hivewise',
};

/**
 * Where the dashboard guard parks a signed-in account that has not clicked its
 * link yet. Lives outside the `(anonymous)` group precisely because it is the
 * one page in this shell that requires a session.
 */
export default async function VerifyEmailPage() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { email: true, emailVerified: true },
	});

	if (!user) {
		redirect('/sign-in');
	}

	if (user.emailVerified) {
		redirect('/dashboard');
	}

	return (
		<>
			<span className='mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-border-2 bg-surface-2'>
				<MailIcon className='h-5 w-5 fill-none stroke-accent stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]' />
			</span>

			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>
				Twoje konto czeka na weryfikację
			</h1>
			<p className='mt-2 text-[14px] leading-relaxed text-muted'>
				Sprawdź skrzynkę <span className='font-medium text-foreground'>{user.email}</span> i kliknij w link aktywacyjny,
				aby przejść do panelu.
			</p>

			<div className='mt-6 flex flex-col gap-5'>
				<p className='text-[13px] leading-relaxed text-subtle'>
					Wiadomość nie dotarła? Sprawdź folder ze spamem lub wyślij link ponownie. Link wygasa po 24 godzinach.
				</p>

				<ResendVerificationButton action={resendVerificationAction} />
			</div>

			<div className='mt-8 text-center'>
				<SignOutButton />
			</div>
		</>
	);
}
