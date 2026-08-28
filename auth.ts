import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';

import { prisma } from '@/app/lib/prisma';

import authConfig from './auth.config';

/**
 * The full Auth.js instance: the provider list from `auth.config.ts` plus the
 * database adapter. Import `auth` from here in server components and route
 * handlers; `proxy.ts` deliberately does not (see `auth.config.ts`).
 *
 * The session strategy is `jwt`, so `Session` rows are never written — but the
 * adapter still runs on first sign-in to create the `User` and link the
 * `Account`, which is why the schema has to satisfy Auth.js's expected columns.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
	adapter: PrismaAdapter(prisma),
	session: { strategy: 'jwt' },
	...authConfig,
	callbacks: {
		// Spread first: a bare `callbacks: {…}` after `...authConfig` would replace
		// the object wholesale and silently drop `authorized`.
		...authConfig.callbacks,

		/**
		 * `token.sub` already holds the user id, but only on the sign-in pass does
		 * `user` exist. Copying it to a named claim keeps the `session` callback
		 * from depending on `sub`'s implicit meaning.
		 */
		jwt({ token, user }) {
			if (user?.id) {
				token.id = user.id;
			}

			return token;
		},

		session({ session, token }) {
			if (token.id) {
				session.user.id = token.id;
			}

			return session;
		},
	},
});
