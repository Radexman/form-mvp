export const DEFAULT_SIGN_IN_REDIRECT = '/dashboard';

/**
 * Narrows an untrusted `?callbackUrl=` down to a same-origin path. Passing it to
 * `signIn({ redirectTo })` unchecked would make the sign-in page an open
 * redirect: sign in on the real site, land on someone else's.
 *
 * `/\evil.example` is rejected alongside `//evil.example` because browsers
 * normalise the backslash and read both as another host.
 */
export function safeCallbackUrl(candidate: string | undefined | null): string {
	if (!candidate || !candidate.startsWith('/')) {
		return DEFAULT_SIGN_IN_REDIRECT;
	}

	if (candidate.startsWith('//') || candidate.startsWith('/\\')) {
		return DEFAULT_SIGN_IN_REDIRECT;
	}

	return candidate;
}
