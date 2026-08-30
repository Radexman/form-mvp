import type { Metadata } from 'next';
import Link from 'next/link';

import { ForgotPasswordForm } from '@/app/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
	title: 'Nie pamiętasz hasła? · Hivewise',
};

export default function ForgotPasswordPage() {
	return (
		<>
			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>
				Nie pamiętasz hasła?
			</h1>
			<p className='mt-2 text-[14px] leading-relaxed text-muted'>
				Podaj adres e-mail przypisany do konta, a wyślemy Ci link do ustawienia nowego hasła.
			</p>

			<div className='mt-6'>
				<ForgotPasswordForm />
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
