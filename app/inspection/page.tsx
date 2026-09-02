import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { InspectionApp } from '../components/inspection/InspectionApp';

export const metadata: Metadata = {
	title: 'Nowy przegląd · Hivewise',
};

/**
 * The inspection wizard, moved off / when the root became a signpost.
 *
 * Deliberately outside the `(dashboard)` group. The wizard is a full-screen
 * flow whose voice panel claims 46dvh at the bottom of the viewport, and that
 * group's shell puts a fixed tab bar in exactly that space on phones — the two
 * cannot share a screen without reworking one of them. Reached from the
 * "Nowy przegląd" button in the dashboard topbar.
 *
 * `proxy.ts` turns anonymous requests away before this renders, but that check
 * is optimistic: it reads the session cookie and never the database. This is
 * the one that actually gates rendering, matching what every page in the
 * dashboard group does.
 */
export default async function InspectionPage() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	return (
		<div className='mx-auto w-full max-w-6xl px-4 py-10'>
			<InspectionApp />
		</div>
	);
}
