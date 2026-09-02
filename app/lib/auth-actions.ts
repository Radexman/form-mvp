'use server';

import { AuthError } from 'next-auth';

import { signIn, signOut } from '@/auth';

import { safeCallbackUrl } from './callback-url';
import { signInSchema } from './auth.schema';
import { loginLimiter } from './ratelimit';
import { checkRateLimit, formatRetryAfter, getIp } from './ratelimit-helpers';

/**
 * Auth.js entry points for the UI. Server actions because `auth.ts` pulls in
 * Prisma — a client component may only hold a reference, never import `signIn`.
 */

export interface SignInActionResult {
	error: string;
}

export async function signInAction(
	values: { email: string; password: string },
	callbackUrl?: string,
): Promise<SignInActionResult | undefined> {
	/**
	 * Before the schema parse and well before `signIn`, because `authorize`
	 * bcrypt-compares on every attempt: an unthrottled sign-in is both a
	 * credential-stuffing target and the cheapest way to pin our CPU. A malformed
	 * submission still costs a token — sending garbage must not buy free tries.
	 */
	const { limited, retryAfterSeconds } = await checkRateLimit(loginLimiter, await getIp());

	if (limited) {
		return { error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${formatRetryAfter(retryAfterSeconds)}.` };
	}

	const parsed = signInSchema.safeParse(values);

	if (!parsed.success) {
		return { error: 'Podaj adres e-mail i hasło' };
	}

	try {
		await signIn('credentials', {
			...parsed.data,
			redirectTo: safeCallbackUrl(callbackUrl),
		});
	} catch (error) {
		// Success leaves through here too — `signIn` redirects, and `redirect()`
		// throws. Only `AuthError` is a failed sign-in; `NEXT_REDIRECT` must keep
		// propagating or the navigation is swallowed.
		if (error instanceof AuthError) {
			// Generic on purpose: `authorize` cannot distinguish an unknown address
			// from a wrong password, and this message must not claim otherwise.
			return { error: 'Nieprawidłowy adres e-mail lub hasło' };
		}

		throw error;
	}
}

export async function signInWithGoogleAction(formData: FormData) {
	await signIn('google', {
		redirectTo: safeCallbackUrl(formData.get('callbackUrl')?.toString()),
	});
}

export async function signOutAction() {
	// `/` is public; the default lands on the current page, which Proxy would
	// bounce straight back to sign-in.
	await signOut({ redirectTo: '/' });
}

/**
 * Sign-out after a successful password change, which is a different event from
 * pressing "sign out".
 *
 * The session this browser holds was minted before the new password, so the
 * `jwt` callback in `auth.ts` refuses it from here on — the user is signed out
 * whether or not anyone asks. Doing it deliberately, and landing on the same
 * `?reset=1` notice the reset flow uses, turns that into a page explaining they
 * need to sign in with the new password instead of an unexplained bounce out of
 * `/profile` on their next click.
 */
export async function signOutAfterPasswordChangeAction() {
	await signOut({ redirectTo: '/sign-in?reset=1' });
}
