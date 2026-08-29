import { auth } from '@/auth';
import { formatShortName } from '@/app/lib/dashboard';

import { PlusIcon } from './icons';
import { UserMenu } from './UserMenu';

/**
 * `min-h-11` is the 44px touch minimum; it only relaxes to the mock's compact
 * 12px-padding bar from `lg` up, where there's a pointer.
 */
const BUTTON_BASE =
	'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border text-[13px] transition-colors lg:min-h-0 lg:px-3 lg:py-1.5 lg:text-[12px]';
const BUTTON_SECONDARY =
	'border-border-2 bg-surface-2 font-medium text-muted hover:border-border-3 hover:text-foreground';
const BUTTON_PRIMARY = 'border-transparent bg-accent font-semibold text-background hover:bg-accent-hover';

const ICON = 'h-4 w-4 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] lg:h-3.25 lg:w-3.25';

interface TopbarProps {
	apiaryName: string;
	location: string;
}

/**
 * Sticky against the scroll container in `(dashboard)/layout.tsx` — the `<main>`
 * element, not the viewport — which is why it needs an explicit surface
 * background rather than inheriting the page's.
 *
 * Async because below `lg` it carries the account menu. Reads the session
 * itself rather than taking a prop — a JWT cookie decode, not a query.
 */
export async function Topbar({ apiaryName, location }: TopbarProps) {
	const session = await auth();

	return (
		<header className='sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-b-border bg-surface px-4 py-2 lg:px-6 lg:py-3'>
			{/* min-w-0 lets the name truncate instead of shoving the buttons off-screen. */}
			<div className='flex min-w-0 items-center gap-2'>
				<span className='truncate text-[14px] font-medium text-foreground lg:text-[13px]'>{apiaryName}</span>
				{/* The separator belongs to the location, not to the bar — an apiary with
				    no location set would otherwise render a dangling "·". */}
				{location && <span className='hidden shrink-0 text-[12px] text-muted sm:inline'>· {location}</span>}
			</div>

			<div className='flex shrink-0 items-center gap-2'>
				{/* Drops to an icon-only square on phones — "Dodaj ul" is the rarer action
				    and the label is what a narrow bar can least afford. */}
				<button
					type='button'
					aria-label='Dodaj ul'
					className={`${BUTTON_SECONDARY} ${BUTTON_BASE} min-w-11 lg:min-w-0`}
				>
					<PlusIcon className={ICON} />
					<span className='hidden lg:inline'>Dodaj ul</span>
				</button>
				<button
					type='button'
					className={`${BUTTON_PRIMARY} ${BUTTON_BASE} px-3`}
				>
					<PlusIcon className={ICON} />
					Nowy przegląd
				</button>

				{/* Phones only — from `lg` up this menu lives in the sidebar footer. */}
				{session?.user && (
					<UserMenu
						variant='topbar'
						className='lg:hidden'
						name={session.user.name ?? null}
						shortName={formatShortName(session.user.name ?? null)}
						image={session.user.image ?? null}
					/>
				)}
			</div>
		</header>
	);
}
