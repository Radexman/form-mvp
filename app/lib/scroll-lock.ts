/**
 * Page scroll lock, counted rather than captured.
 *
 * The obvious version — remember `body.style.overflow`, restore it on the way
 * out — is only correct while exactly one thing in the app ever locks. A second
 * locker records `'hidden'` as its "previous" and restores `'hidden'` for good.
 */

let depth = 0;
let epoch = 0;

/** Locks scrolling and returns the release, which is safe to call twice. */
export function lockBodyScroll(): () => void {
	if (depth === 0) document.body.style.overflow = 'hidden';
	depth += 1;

	// React unmounts a tree parent-first, so a form clearing every lock on its
	// way out runs *before* the panel inside it releases. Without the epoch that
	// late release drives the count negative and the next lock silently no-ops.
	const issued = epoch;
	let released = false;
	return () => {
		if (released || issued !== epoch) return;
		released = true;
		depth -= 1;
		if (depth === 0) document.body.style.overflow = '';
	};
}

/**
 * Drops every outstanding lock. For unmount paths that have to guarantee a
 * scrollable page whatever their children did — not for ordinary release.
 */
export function releaseAllScrollLocks(): void {
	depth = 0;
	epoch += 1;
	document.body.style.overflow = '';
}

/** Test seam: how many locks are outstanding. */
export function scrollLockDepth(): number {
	return depth;
}
