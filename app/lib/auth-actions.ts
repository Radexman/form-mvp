'use server';

import { signOut } from '@/auth';

/**
 * Sign-out has to be a server action: `auth.ts` pulls in the Prisma client and
 * the `pg` driver, so a client component may only ever hold a reference to this
 * function, never import `signOut` itself.
 *
 * Wrapped in a `<form action={…}>` rather than an onClick handler so it is a
 * real POST — Auth.js's own sign-out page uses a form for the same reason, and
 * a GET that mutates the session is a CSRF hazard.
 */
export async function signOutAction() {
	// `/` is public; the default would land on the current page, which Proxy
	// would immediately bounce back to the sign-in screen.
	await signOut({ redirectTo: '/' });
}
