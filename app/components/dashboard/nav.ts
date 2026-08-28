import { ChartIcon, GridIcon, UserIcon } from './icons';

/**
 * One list, two presentations: a left rail from `lg` up (`Sidebar`) and a
 * thumb-reachable bottom bar below it (`MobileNav`). Adding a destination here
 * puts it in both.
 */
export const NAV_ITEMS = [
	{ label: 'Dashboard', href: '/dashboard', Icon: GridIcon },
	{ label: 'Analityka', href: '/analytics', Icon: ChartIcon },
	{ label: 'Ustawienia', href: '/settings', Icon: UserIcon },
] as const;

/** Shared by both bars so the highlighted destination can never differ between them. */
export function isNavItemActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}
