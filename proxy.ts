import NextAuth from 'next-auth';

import authConfig from './auth.config';

/**
 * Route protection for the authenticated pages.
 *
 * Built from `auth.config.ts` rather than `auth.ts` so the Prisma client stays
 * out of this file — Proxy runs ahead of every matched request, and the Next
 * docs are explicit that it should read the session cookie and not touch the
 * database. With the `jwt` strategy that is all the session needs anyway.
 *
 * This is an optimistic check, not the security boundary: pages still call
 * `auth()` themselves.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
	// Scoped on purpose. Auth.js suggests running Proxy on all routes, but `/`
	// and `/api/generate-pdf` are public today. Every page in the `(dashboard)`
	// group belongs here — the group adds no URL segment, so each of its routes
	// has to be listed by its own path.
	matcher: ['/dashboard/:path*', '/profile'],
};
