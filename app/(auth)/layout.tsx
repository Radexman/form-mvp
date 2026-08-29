import { redirect } from 'next/navigation';

import { AuthBackdrop } from '@/app/components/auth/AuthBackdrop';
import { AuthShowcase } from '@/app/components/auth/AuthShowcase';
import { HexIcon } from '@/app/components/dashboard/icons';
import { auth } from '@/auth';

/**
 * Shell for `/sign-in` and `/register`. `min-h-dvh`, not `h-dvh`: there is no
 * inner scroll container, so a fixed height would clip the register form on a
 * landscape phone with nothing able to scroll.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	// Proxy only matches `/dashboard/*`, so nothing above this turns away a
	// signed-in user arriving from a bookmark or the back button.
	const session = await auth();

	if (session?.user) {
		redirect('/dashboard');
	}

	return (
		// `relative` anchors the absolutely positioned backdrop.
		<div className='relative flex min-h-dvh w-full'>
			<AuthBackdrop />
			<AuthShowcase />

			{/* `relative` stacks the form above the backdrop without a z-index. */}
			<main className='relative flex flex-1 flex-col justify-center px-5 py-10 sm:px-10'>
				<div className='mx-auto w-full max-w-sm'>
					<div className='mb-8 flex items-center gap-2.5 lg:hidden'>
						<span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent'>
							<HexIcon className='h-4 w-4 fill-none stroke-background stroke-[2.5] [stroke-linejoin:round]' />
						</span>
						<span className='text-[14px] font-semibold tracking-[-0.01em] text-foreground'>Hivewise</span>
					</div>
					{children}
				</div>
			</main>
		</div>
	);
}
