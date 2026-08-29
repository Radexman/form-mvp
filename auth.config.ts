import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

/**
 * The half of the Auth.js config that carries no database dependency.
 *
 * `proxy.ts` builds its own NextAuth instance from this file alone, so the
 * Prisma client and the `pg` driver never enter the module graph of a file that
 * runs on every matched request. Next 16 runs Proxy on the Node.js runtime, so
 * they *would* load — this split is about keeping the request path light, not
 * about the Edge runtime it was originally needed for.
 *
 * `auth.ts` spreads this and adds the adapter.
 */

/**
 * Exported so `auth.ts` can reuse it by reference. That file rebuilds the
 * provider list from scratch (see below), and Google's options should be
 * declared exactly once.
 */
export const googleProvider = Google({
	// Links a Google sign-in to an existing user with the same address instead of
	// failing with OAuthAccountNotLinked. "Dangerous" only for providers that let
	// an account hold an unverified address — Google verifies every email it
	// returns, so the account cannot be claimed by someone who merely typed the
	// address. With credentials sign-in in place this is no longer hypothetical:
	// it is what lets someone who registered with a password later use the Google
	// button on the same address.
	allowDangerousEmailAccountLinking: true,
});

/**
 * A deliberately inert copy of the Credentials provider.
 *
 * The real `authorize` has to reach Prisma and bcrypt, which is precisely what
 * this file exists to keep out of the Proxy module graph — so it lives in
 * `auth.ts`, which replaces this entry wholesale.
 *
 * `authorize: () => null` means this copy can never sign anyone in. Harmless:
 * `config.matcher` never routes `/api/auth/*` through Proxy, so the instance
 * built here only ever reads the session cookie. The entry exists so both
 * instances describe the same provider list.
 */
export const credentialsPlaceholder = Credentials({
	credentials: { email: {}, password: {} },
	authorize: () => null,
});

export default {
	/**
	 * Must live here, not in `auth.ts`: the redirect that matters is the one the
	 * `authorized` callback triggers, and that runs on the Proxy instance built
	 * from this file alone.
	 */
	pages: {
		signIn: '/sign-in',
	},

	callbacks: {
		/**
		 * Consulted only on the Proxy path, and it is what makes route protection
		 * happen at all: without this callback next-auth defaults `authorized` to
		 * `true` and the middleware merely attaches `req.auth` without blocking.
		 *
		 * Returning `false` lets next-auth issue its own redirect to
		 * `/api/auth/signin?callbackUrl=…`. Wrapping `auth(fn)` in `proxy.ts`
		 * instead would take priority over that branch and suppress the redirect,
		 * which is why the export there stays bare.
		 *
		 * No path check is needed — `config.matcher` already scopes Proxy to
		 * `/dashboard/*`.
		 */
		authorized({ auth }) {
			return Boolean(auth?.user);
		},
	},
	providers: [googleProvider, credentialsPlaceholder],
} satisfies NextAuthConfig;
