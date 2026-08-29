import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { signInSchema } from '@/app/lib/auth.schema';
import { prisma } from '@/app/lib/prisma';

import authConfig, { googleProvider } from './auth.config';

/**
 * The full Auth.js instance: the provider list from `auth.config.ts` plus the
 * database adapter. Import `auth` from here in server components and route
 * handlers; `proxy.ts` deliberately does not (see `auth.config.ts`).
 *
 * The session strategy is `jwt`, so `Session` rows are never written — but the
 * adapter still runs on first sign-in to create the `User` and link the
 * `Account`, which is why the schema has to satisfy Auth.js's expected columns.
 * The strategy is also load-bearing for credentials: Auth.js refuses to issue a
 * database session for a provider it cannot verify on its own.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
	adapter: PrismaAdapter(prisma),
	session: { strategy: 'jwt' },
	...authConfig,

	// Overwrites the spread list on purpose — `auth.config.ts` carries a
	// Credentials placeholder whose `authorize` always returns null. Google is
	// reused by reference rather than reconfigured. (Contrast `callbacks` below,
	// where overwriting instead of spreading would silently drop `authorized`.)
	providers: [
		googleProvider,
		Credentials({
			// Shapes next-auth's own `/api/auth/signin` form. Phase 3 replaces that
			// page, but the field names stay the payload contract either way.
			credentials: {
				email: { label: 'E-mail', type: 'email' },
				password: { label: 'Hasło', type: 'password' },
			},

			/**
			 * Returns `null` for every failure, never a reason. next-auth turns that
			 * into a single `CredentialsSignin` error, so an unknown address, an
			 * OAuth-only account and a wrong password are indistinguishable to the
			 * caller.
			 *
			 * Throwing here instead would surface as `CallbackRouteError`, which
			 * next-auth treats as a server fault rather than a failed sign-in.
			 */
			async authorize(credentials) {
				const parsed = signInSchema.safeParse(credentials);

				if (!parsed.success) {
					return null;
				}

				const { email, password } = parsed.data;
				const user = await prisma.user.findUnique({ where: { email } });

				// A null `passwordHash` is an OAuth-only account. `bcrypt.compare`
				// would reject it anyway, but only after being handed a null it is
				// not typed to take.
				if (!user?.passwordHash) {
					return null;
				}

				if (!(await bcrypt.compare(password, user.passwordHash))) {
					return null;
				}

				// Whatever this resolves to is handed straight to the `jwt` callback
				// as `user`, so it lists fields explicitly — spreading the row would
				// put `passwordHash` in the token.
				return {
					id: user.id,
					email: user.email,
					name: user.name,
					image: user.image,
				};
			},
		}),
	],

	events: {
		/**
		 * Google verifies every address it returns, so an OAuth account clears the
		 * verification gate the moment it is linked. Without this the adapter would
		 * leave `emailVerified` null — it only sets it for email-link flows — and
		 * the dashboard guard would lock out every Google user.
		 *
		 * Also fires on the `allowDangerousEmailAccountLinking` path, where someone
		 * who registered with a password later uses the Google button; any pending
		 * token of theirs is dropped here rather than left live.
		 */
		async linkAccount({ user }) {
			if (!user.id) {
				return;
			}

			await prisma.user.update({
				where: { id: user.id },
				data: {
					emailVerified: new Date(),
					verificationToken: null,
					verificationTokenExpiresAt: null,
				},
			});
		},
	},

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
