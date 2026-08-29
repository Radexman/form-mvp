import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthDivider } from '@/app/components/auth/fields';
import { GoogleButton } from '@/app/components/auth/GoogleButton';
import { SignInForm } from '@/app/components/auth/SignInForm';

export const metadata: Metadata = {
	title: 'Zaloguj się · Hivewise',
};

/** Set by the redirects out of `/api/auth/verify-email`. */
const VERIFICATION_NOTICES = {
	true: { tone: 'ok', text: 'E-mail potwierdzony. Możesz się teraz zalogować.' },
	already: { tone: 'ok', text: 'Ten link był już użyty. Zaloguj się.' },
	invalid_token: { tone: 'error', text: 'Link jest nieprawidłowy lub wygasł. Zaloguj się i wyślij nowy.' },
} as const;

function verificationNotice(verified?: string, error?: string) {
	if (verified === 'true' || verified === 'already') {
		return VERIFICATION_NOTICES[verified];
	}

	return error === 'invalid_token' ? VERIFICATION_NOTICES.invalid_token : undefined;
}

/** Replaces next-auth's built-in page; wired up by `pages.signIn` in `auth.config.ts`. */
export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string; verified?: string; error?: string }>;
}) {
	const { callbackUrl, verified, error } = await searchParams;
	const notice = verificationNotice(verified, error);

	return (
		<>
			<h1 className='text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground'>Zaloguj się</h1>
			<p className='mt-2 text-[14px] text-muted'>Wróć do swojej pasieki.</p>

			{notice && (
				<p
					role='status'
					className={
						notice.tone === 'ok'
							? 'mt-6 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-[13px] text-accent'
							: 'mt-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger'
					}
				>
					{notice.text}
				</p>
			)}

			<div className='mt-6 flex flex-col gap-5'>
				<SignInForm callbackUrl={callbackUrl} />
				<AuthDivider />
				<GoogleButton callbackUrl={callbackUrl} />
			</div>

			<p className='mt-8 text-center text-[13px] text-muted'>
				Nie masz jeszcze konta?{' '}
				<Link
					href='/register'
					className='font-medium text-accent transition-colors hover:text-accent-hover'
				>
					Zarejestruj się
				</Link>
			</p>
		</>
	);
}
