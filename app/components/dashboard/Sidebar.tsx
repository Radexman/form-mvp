'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutAction } from '@/app/lib/auth-actions';

import { HexIcon, SignOutIcon } from './icons';
import { isNavItemActive, NAV_ITEMS } from './nav';

/**
 * Both states carry a 2px left border — the inactive one transparent — so the
 * label sits at the same x whether or not the item is active. Colouring an
 * absent border instead would shift every row by 2px on navigation.
 */
const NAV_ITEM_BASE = 'flex items-center gap-2.25 border-l-2 px-3.5 py-1.75 text-[13px] transition-colors';
const NAV_ITEM_ACTIVE = 'border-l-accent bg-accent/5 text-foreground';
const NAV_ITEM_INACTIVE = 'border-l-transparent text-muted hover:text-foreground';

interface SidebarProps {
	/** Already shortened by the layout, e.g. "Jan P.". */
	userName: string;
	userInitials: string;
	isPremium: boolean;
}

/**
 * Desktop only. Below `lg` the same destinations render as `MobileNav`, which
 * has no footer — so the name, plan and sign-out control simply do not exist on
 * phones (`Ustawienia` is the stand-in until Phase 3).
 *
 * Still a client component, for `usePathname` only. The session is read by the
 * layout and handed down as props: this file must not reach for `auth()`, which
 * would pull Prisma into the client bundle.
 */
export function Sidebar({ userName, userInitials, isPremium }: SidebarProps) {
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

			<div className='flex items-center gap-2.25 border-t border-t-border px-3.5 py-3'>
				<span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-2 bg-surface-3 text-[11px] font-semibold text-accent'>
					{userInitials}
				</span>
				<span className='flex min-w-0 flex-1 flex-col'>
					<span className='truncate text-[12px] font-medium text-foreground'>{userName}</span>
					{/* Premium is the accent green; Free stays muted so the badge reads as
					    a status rather than as a permanent decoration. */}
					<span className={`text-[10px] ${isPremium ? 'text-accent' : 'text-muted'}`}>
						{isPremium ? 'Premium' : 'Free'}
					</span>
				</span>

				{/*
				 * A form, not an onClick — `signOutAction` is a server action and this
				 * has to be a POST. Phase 3 folds it into a dropdown on the avatar;
				 * until then it is the only way out of a session short of clearing
				 * cookies, which is what made testing credentials sign-in awkward.
				 */}
				<form action={signOutAction}>
					<button
						type='submit'
						title='Wyloguj się'
						aria-label='Wyloguj się'
						className='flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-foreground'
					>
						<SignOutIcon className='h-4 w-4 fill-none stroke-current stroke-[1.8]' />
					</button>
				</form>
			</div>
		</aside>
	);
}
