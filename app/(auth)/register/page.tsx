import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthDivider } from '@/app/components/auth/fields';
import { GoogleButton } from '@/app/components/auth/GoogleButton';
import { RegisterForm } from '@/app/components/auth/RegisterForm';

export const metadata: Metadata = {
	title: 'Załóż konto · Hivewise',
};

export default function RegisterPage() {
	return (
		<>
			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>Załóż konto</h1>
			<p className='mt-2 text-[14px] text-muted'>Zacznij prowadzić przeglądy w jednym miejscu.</p>

			<div className='mt-6 flex flex-col gap-5'>
				<RegisterForm />
				<AuthDivider />
				{/* Same button as sign-in: the provider creates the user on first
				    consent, so Google needs no separate register path. */}
				<GoogleButton />
			</div>

			<p className='mt-8 text-center text-[13px] text-muted'>
				Masz już konto?{' '}
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
