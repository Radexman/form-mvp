import { redirect } from 'next/navigation';

import { auth } from '@/auth';

/**
 * The site root is a signpost, not a page.
 *
 * It used to render the inspection wizard to anyone who asked, which is what
 * made /api/generate-pdf reachable without an account. The wizard now lives at
 * /inspection behind a session, and this route only decides where someone
 * belongs: their apiary if they are signed in, the sign-in page if not.
 *
 * Reading the session makes / dynamic, so the static prerender it used to get
 * is gone by design. No callbackUrl is attached to the anonymous branch —
 * DEFAULT_SIGN_IN_REDIRECT already lands a successful sign-in on /dashboard,
 * which is exactly where this would have sent them.
 */
export default async function Home() {
	const session = await auth();

	redirect(session?.user?.id ? '/dashboard' : '/sign-in');
}
