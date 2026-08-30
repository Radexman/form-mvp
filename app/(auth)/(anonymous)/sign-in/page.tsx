import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthDivider } from '@/app/components/auth/fields';
import { GoogleButton } from '@/app/components/auth/GoogleButton';
import { SignInForm } from '@/app/components/auth/SignInForm';

export const metadata: Metadata = {
	title: 'Zaloguj się · Hivewise',
};

/** Set by the redirects out of `/api/auth/verify-email`, and by the register form. */
const NOTICES = {
	true: { tone: 'ok', text: 'E-mail potwierdzony. Możesz się teraz zalogować.' },
	already: { tone: 'ok', text: 'Ten link był już użyty. Zaloguj się.' },
	invalid_token: { tone: 'error', text: 'Link jest nieprawidłowy lub wygasł. Zaloguj się i wyślij nowy.' },
	// Where the register form lands when email verification is switched off, so
	// there is no `/register/check-email` step between account and sign-in.
	registered: { tone: 'ok', text: 'Konto zostało utworzone. Możesz się teraz zalogować.' },
	reset: { tone: 'ok', text: 'Hasło zostało zmienione. Zaloguj się nowym hasłem.' },
} as const;

function pageNotice(verified?: string, error?: string, registered?: string, reset?: string) {
	if (verified === 'true' || verified === 'already') {
		return NOTICES[verified];
	}

	if (error === 'invalid_token') {
		return NOTICES.invalid_token;
	}

	if (reset === '1') {
		return NOTICES.reset;
	}

	return registered === '1' ? NOTICES.registered : undefined;
}

/** Replaces next-auth's built-in page; wired up by `pages.signIn` in `auth.config.ts`. */
export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{
		callbackUrl?: string;
		verified?: string;
		error?: string;
		registered?: string;
		reset?: string;
	}>;
}) {
	const { callbackUrl, verified, error, registered, reset } = await searchParams;
	const notice = pageNotice(verified, error, registered, reset);

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
