import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { formatShortName } from '@/app/lib/dashboard';
import { isEmailVerificationEnabled } from '@/app/lib/email/config';
import { prisma } from '@/app/lib/prisma';

import { MobileNav } from '../components/dashboard/MobileNav';
import { Sidebar } from '../components/dashboard/Sidebar';

/**
 * Shell for every authenticated page, in two arrangements:
 *
 * - phones: a column — scrolling `<main>` above a fixed bottom tab bar.
 * - `lg` and up: a row — a static sidebar rail beside the scrolling `<main>`.
 *
 * `<main>` is the only scroll container in both, which is what lets each page's
 * topbar stick to the top of the content rather than the viewport.
 *
 * Height is `h-dvh`, not `h-screen`: on mobile browsers `100vh` counts the
 * collapsing URL bar, so a `100vh` shell puts the bottom tab bar just off the
 * bottom of the screen until the user scrolls. The `min-h` floor is desktop-only
 * for the same reason — 640px is taller than a landscape phone.
 *
 * Now async: it reads the session for the sidebar footer, which makes every
 * route in this group dynamic.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	// `proxy.ts` already blocks anonymous requests to `/dashboard/*`; that check
	// is optimistic (it reads the cookie, not the database), so this is the one
	// that actually gates rendering.
	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	// One lookup covers both the shell's plan badge and the verification gate.
	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { emailVerified: true, subscription: { select: { tier: true } } },
	});

	if (!user) {
		redirect('/sign-in');
	}

	// Google accounts are stamped verified when the account is linked (see the
	// `linkAccount` event in `auth.ts`), so this needs no provider clause.
	//
	// The flag check comes first so that accounts left unverified from a period
	// when verification was on are not stranded once it is switched off — they
	// are the whole reason the gate is skipped rather than the stamp being
	// backfilled here.
	if (isEmailVerificationEnabled() && !user.emailVerified) {
		redirect('/verify-email');
	}

	return (
		<div className='flex h-dvh w-full flex-col lg:min-h-160 lg:flex-row'>
			<Sidebar
				userName={session.user.name ?? null}
				userShortName={formatShortName(session.user.name ?? null)}
				userImage={session.user.image ?? null}
				// No subscription row at all reads as FREE — the seed writes one, but
				// an account created through `/api/auth/register` has none.
				isPremium={user.subscription?.tier === 'PREMIUM'}
			/>
			<main className='flex flex-1 flex-col overflow-y-auto'>{children}</main>
			<MobileNav />
		</div>
	);
}
