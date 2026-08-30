import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/app/components/auth/ResetPasswordForm';
import { emailFromPasswordResetIdentifier, isPasswordResetTokenExpired } from '@/app/lib/email/password-reset-token';
import { prisma } from '@/app/lib/prisma';

export const metadata: Metadata = {
	title: 'Ustaw nowe hasło · Hivewise',
};

function DeadLink() {
	return (
		<>
			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>
				Link wygasł lub jest nieprawidłowy
			</h1>
			<p className='mt-2 text-[14px] leading-relaxed text-muted'>
				Link do zmiany hasła jest ważny przez godzinę i można go użyć tylko raz. Poproś o nowy, aby ustawić hasło.
			</p>

			<div className='mt-6'>
				<Link
					href='/forgot-password'
					className='inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-accent px-4 text-[14px] font-semibold text-background transition-colors hover:bg-accent-hover'
				>
					Wyślij nowy link
				</Link>
			</div>

			<p className='mt-8 text-center text-[13px] text-muted'>
				Pamiętasz hasło?{' '}
				<Link
					href='/sign-in'
					className='font-medium text-accent transition-colors hover:text-accent-hover'
				>
					Zaloguj się
				</Link>
			</p>
		</>
	);
}

/**
 * Outside the `(anonymous)` group on purpose: that layout redirects anyone with
 * a live session, which would swallow the link for a user who is still signed in
 * somewhere and burn a token they cannot spend.
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
	const { token } = await searchParams;

	if (!token) {
		return <DeadLink />;
	}

	// Checked here only so a dead link shows a way forward instead of a form that
	// fails on submit. The route handler re-checks; this is not the gate.
	const record = await prisma.verificationToken.findUnique({ where: { token } });

	if (
		!record ||
		!emailFromPasswordResetIdentifier(record.identifier) ||
		isPasswordResetTokenExpired(record.expires, new Date())
	) {
		return <DeadLink />;
	}

	return (
		<>
			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>Ustaw nowe hasło</h1>
			<p className='mt-2 text-[14px] leading-relaxed text-muted'>
				Wybierz nowe hasło do swojego konta. Po zapisaniu zalogujesz się nim od razu.
			</p>

			<div className='mt-6'>
				<ResetPasswordForm token={token} />
			</div>
		</>
	);
}
