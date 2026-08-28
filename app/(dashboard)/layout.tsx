import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { formatInitials, formatShortName } from '@/app/lib/dashboard';
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
	// that actually gates rendering. `/api/auth/signin` rather than the spec's
	// `/login`, which does not exist — Phase 3 replaces it with `/sign-in`.
	if (!session?.user?.id) {
		redirect('/api/auth/signin');
	}

	// Separate from the page's apiary query on purpose: the plan badge belongs to
	// the shell, which outlives any one page. One indexed lookup on a unique
	// column, and it selects a single column rather than the row.
	const subscription = await prisma.subscription.findUnique({
		where: { userId: session.user.id },
		select: { tier: true },
	});

	return (
		<div className='flex h-dvh w-full flex-col lg:min-h-160 lg:flex-row'>
			<Sidebar
				userName={formatShortName(session.user.name ?? null)}
				userInitials={formatInitials(session.user.name ?? null)}
				// No subscription row at all reads as FREE — the seed writes one, but
				// an account created through `/api/auth/register` has none.
				isPremium={subscription?.tier === 'PREMIUM'}
			/>
			<main className='flex flex-1 flex-col overflow-y-auto'>{children}</main>
			<MobileNav />
		</div>
	);
}
