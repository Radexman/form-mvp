'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { HexIcon } from './icons';
import { isNavItemActive, NAV_ITEMS } from './nav';
import { UserMenu } from './UserMenu';

/**
 * Both states carry a 2px left border — the inactive one transparent — so the
 * label sits at the same x whether or not the item is active. Colouring an
 * absent border instead would shift every row by 2px on navigation.
 */
const NAV_ITEM_BASE = 'flex items-center gap-2.25 border-l-2 px-3.5 py-1.75 text-[13px] transition-colors';
const NAV_ITEM_ACTIVE = 'border-l-accent bg-accent/5 text-foreground';
const NAV_ITEM_INACTIVE = 'border-l-transparent text-muted hover:text-foreground';

interface SidebarProps {
	/** Full name — the menu heading and the initials fallback both need it. */
	userName: string | null;
	/** Already shortened by the layout, e.g. "Jan P.". */
	userShortName: string;
	userImage: string | null;
	isPremium: boolean;
}

/**
 * Desktop only. Below `lg` the same destinations render as `MobileNav`, and the
 * account control this footer holds is mirrored into `Topbar` — the bottom tab
 * bar stays navigation-only.
 *
 * Still a client component, for `usePathname` only. The session is read by the
 * layout and handed down as props: this file must not reach for `auth()`, which
 * would pull Prisma into the client bundle.
 */
export function Sidebar({ userName, userShortName, userImage, isPremium }: SidebarProps) {
	const pathname = usePathname();

	return (
		<aside className='hidden w-48 shrink-0 flex-col border-r border-r-border bg-surface lg:flex'>
			<div className='flex items-center gap-2.25 border-b border-b-border px-4 pt-4.5 pb-4'>
				<span className='flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-accent'>
					<HexIcon className='h-3.5 w-3.5 fill-none stroke-background stroke-[2.5] [stroke-linejoin:round]' />
				</span>
				<span className='text-[13px] font-semibold tracking-[-0.01em] text-foreground'>Hivewise</span>
			</div>

			<nav className='flex-1 py-2'>
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
							className={`${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
						>
							<Icon className='h-3.75 w-3.75 shrink-0 fill-none stroke-current stroke-[1.8]' />
							{label}
						</Link>
					);
				})}
			</nav>

			<div className='border-t border-t-border px-2 py-2.5'>
				<UserMenu
					variant='sidebar'
					name={userName}
					shortName={userShortName}
					image={userImage}
					isPremium={isPremium}
				/>
			</div>
		</aside>
	);
}
