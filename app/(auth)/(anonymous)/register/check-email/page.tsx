import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ResendVerificationButton } from '@/app/components/auth/ResendVerificationButton';
import { MailIcon } from '@/app/components/dashboard/icons';
import { isEmailVerificationEnabled } from '@/app/lib/email/config';
import { resendVerificationForEmailAction } from '@/app/lib/email/verification-actions';

export const metadata: Metadata = {
	title: 'Sprawdź skrzynkę · Hivewise',
};

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
	const { email } = await searchParams;

	// With verification off the register form goes straight to `/sign-in`, so
	// this page is only reachable by hand — and it would promise an email that
	// is never coming.
	if (!isEmailVerificationEnabled()) {
		redirect('/sign-in');
	}

	// Reached only by the register form's redirect; without an address there is
	// nothing to show and nothing to re-send to.
	if (!email) {
		redirect('/register');
	}

	return (
		<>
			<span className='mb-6 flex h-11 w-11 items-center justify-center rounded-lg border border-border-2 bg-surface-2'>
				<MailIcon className='h-5 w-5 fill-none stroke-accent stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]' />
			</span>

			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>
				Sprawdź swoją skrzynkę
			</h1>
			<p className='mt-2 text-[14px] leading-relaxed text-muted'>
				Wysłaliśmy link aktywacyjny na adres <span className='font-medium text-foreground'>{email}</span>. Kliknij w
				link, aby aktywować konto.
			</p>

			<div className='mt-6 flex flex-col gap-5'>
				<p className='text-[13px] leading-relaxed text-subtle'>
					Wiadomość nie dotarła? Sprawdź folder ze spamem lub wyślij link ponownie. Link wygasa po 24 godzinach.
				</p>

				<ResendVerificationButton action={resendVerificationForEmailAction.bind(null, email)} />
			</div>

			<p className='mt-8 text-center text-[13px] text-muted'>
				Masz już potwierdzone konto?{' '}
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
