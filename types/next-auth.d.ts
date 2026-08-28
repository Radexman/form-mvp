import type { DefaultSession } from 'next-auth';

/**
 * Adds `user.id` to the session and the JWT. Auth.js's `DefaultSession["user"]`
 * carries only name / email / image, so without this every `session.user.id`
 * read would need a cast — including the ones Dashboard Spec 2 depends on.
 */
declare module 'next-auth' {
	interface Session {
		user: {
			id: string;
		} & DefaultSession['user'];
	}
}

/**
 * Augments `@auth/core/jwt`, not `next-auth/jwt`. The latter is a bare
 * `export * from "@auth/core/jwt"`, so augmenting it declares a second, unused
 * `JWT` rather than merging into the interface the callbacks actually use —
 * leaving `token.id` as `unknown`. Auth.js's own docs show the `next-auth/jwt`
 * form; it does not work on this version.
 */
declare module '@auth/core/jwt' {
	interface JWT {
		id?: string;
	}
}
