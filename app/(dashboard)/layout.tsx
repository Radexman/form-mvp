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
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className='flex h-dvh w-full flex-col lg:min-h-160 lg:flex-row'>
			<Sidebar />
			<main className='flex flex-1 flex-col overflow-y-auto'>{children}</main>
			<MobileNav />
		</div>
	);
}
