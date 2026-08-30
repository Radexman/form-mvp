'use client';

import { Menu, Portal } from '@ark-ui/react';
import Link from 'next/link';
import { useRef } from 'react';

import { Avatar } from '@/app/components/ui/Avatar';
import { signOutAction } from '@/app/lib/auth-actions';

import { SignOutIcon, UserIcon } from './icons';

interface UserMenuProps {
	name: string | null;
	shortName: string;
	image: string | null;
	variant: 'sidebar' | 'topbar';
	isPremium?: boolean;
	className?: string;
}

const ITEM =
	'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors data-highlighted:bg-surface-3 data-highlighted:text-foreground';

export function UserMenu({ name, shortName, image, variant, isPremium = false, className = '' }: UserMenuProps) {
	const signOutForm = useRef<HTMLFormElement>(null);

	const isSidebar = variant === 'sidebar';

	return (
		<>
			<form
				ref={signOutForm}
				action={signOutAction}
				className='hidden'
			/>

			{/* Both variants mount below `lg` (the sidebar's inside a hidden `aside`),
			    so the panel markup would otherwise sit in the document twice. The
			    sign-out form is outside the content so unmounting cannot take it. */}
			<Menu.Root
				lazyMount
				unmountOnExit
				positioning={{ placement: isSidebar ? 'top-start' : 'bottom-end', gutter: 8 }}
			>
				<Menu.Trigger
					aria-label='Menu konta'
					className={
						isSidebar
							? `flex w-full cursor-pointer items-center gap-2.25 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-3 ${className}`
							: `flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[7px] transition-colors hover:bg-surface-3 ${className}`
					}
				>
					<Avatar
						image={image}
						name={name}
						size={isSidebar ? 28 : 30}
					/>

					{isSidebar && (
						<span className='flex min-w-0 flex-1 flex-col'>
							<span className='truncate text-[12px] font-medium text-foreground'>{shortName}</span>
							<span className={`text-[10px] ${isPremium ? 'text-accent' : 'text-muted'}`}>
								{isPremium ? 'Premium' : 'Free'}
							</span>
						</span>
					)}
				</Menu.Trigger>

				<Portal>
					<Menu.Positioner>
						<Menu.Content className='z-50 min-w-44 rounded-lg border border-border-2 bg-surface-2 p-1 shadow-lg shadow-black/40 focus:outline-none'>
							<p className='truncate px-2.5 pt-1.5 pb-2 text-[12px] font-medium text-foreground'>
								{name ?? 'Pszczelarz'}
							</p>

							<Menu.Separator className='mx-1 my-1 border-t border-t-border' />

							<Menu.Item
								value='profile'
								asChild
							>
								<Link
									href='/profile'
									className={ITEM}
								>
									<UserIcon className='h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.8]' />
									Profil
								</Link>
							</Menu.Item>

							<Menu.Item
								value='sign-out'
								onSelect={() => signOutForm.current?.requestSubmit()}
								className={ITEM}
							>
								<SignOutIcon className='h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.8]' />
								Wyloguj się
							</Menu.Item>
						</Menu.Content>
					</Menu.Positioner>
				</Portal>
			</Menu.Root>
		</>
	);
}
