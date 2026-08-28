import type { NextAuthConfig } from 'next-auth';
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
export default {
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
	providers: [
		Google({
			// Links a Google sign-in to an existing user with the same address
			// instead of failing with OAuthAccountNotLinked. "Dangerous" only for
			// providers that let an account hold an unverified address — Google
			// verifies every email it returns, so the account cannot be claimed by
			// someone who merely typed the address.
			allowDangerousEmailAccountLinking: true,
		}),
	],
} satisfies NextAuthConfig;
