import { redirect } from 'next/navigation';

import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

/**
 * Scopes the signed-in redirect to the pages that must not be seen with a live
 * session. Proxy only matches `/dashboard/*`, so nothing above this turns away
 * someone arriving from a bookmark or the back button.
 *
 * An unverified user goes to `/verify-email` instead of `/dashboard`, which the
 * dashboard guard would bounce them out of anyway.
 */
export default async function AnonymousLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	if (session?.user?.id) {
		const user = await prisma.user.findUnique({
			where: { id: session.user.id },
			select: { emailVerified: true },
		});

		// A session whose user row is gone is stale — leave it alone and let them
		// sign in again. Redirecting would bounce against `/verify-email`, which
		// sends the same case straight back here.
		if (user) {
			redirect(user.emailVerified ? '/dashboard' : '/verify-email');
		}
	}

	return children;
}
