'use server';

import { AuthError } from 'next-auth';

import { signIn, signOut } from '@/auth';

import { safeCallbackUrl } from './callback-url';
import { signInSchema } from './auth.schema';

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
