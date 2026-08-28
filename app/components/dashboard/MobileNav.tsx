'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isNavItemActive, NAV_ITEMS } from './nav';

/**
 * Mirror of `Sidebar` for phones: the active marker moves from the left edge to
 * the top edge, and the whole tab is the hit area rather than just the label.
 *
 * `min-h-14` (56px) clears the 44px minimum with room to spare — this is used
 * outdoors, one-handed, often with gloves on.
 */
const TAB_BASE =
	'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] transition-colors';
const TAB_ACTIVE = 'border-t-accent bg-accent/5 text-foreground';
const TAB_INACTIVE = 'border-t-transparent text-muted';

export function MobileNav() {
	const pathname = usePathname();

	return (
		// pb picks up the iOS home-indicator inset; the root layout sets
		// viewportFit: 'cover', without which env() resolves to 0.
		<nav className='flex shrink-0 border-t border-t-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden'>
			{NAV_ITEMS.map(({ label, href, Icon }) => {
				const isActive = isNavItemActive(pathname, href);

				return (
					<Link
						key={href}
						href={href}
						// TODO: drop once /analytics and /settings exist. Until then the
						// router prefetches two 404s on every dashboard load.
						prefetch={false}
						aria-current={isActive ? 'page' : undefined}
						className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`}
					>
						<Icon className='h-5 w-5 shrink-0 fill-none stroke-current stroke-[1.8]' />
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
