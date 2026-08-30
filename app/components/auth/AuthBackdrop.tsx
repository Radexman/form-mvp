import { HoneycombBackdrop } from '@/app/components/ui/HoneycombBackdrop';

const WASH =
	'bg-[radial-gradient(120%_100%_at_15%_10%,rgba(74,222,128,0.16),transparent_55%),radial-gradient(90%_70%_at_85%_95%,rgba(251,191,36,0.10),transparent_60%),linear-gradient(160deg,#101610_0%,#0d0f0d_60%,#0a0c0a_100%)]';

/**
 * Decorative layer behind the auth screens: drifting honeycomb, wash, scrim.
 * Full-bleed on phones, left half from `lg`.
 *
 * `isolate` is what lets the comb sit at `-z-10` above this wash instead of
 * behind it; `overflow-hidden` keeps the drift's overhang off the page.
 */
export function AuthBackdrop() {
	return (
		<div
			aria-hidden='true'
			className={`pointer-events-none absolute inset-y-0 left-0 isolate w-full overflow-hidden lg:w-1/2 ${WASH}`}
		>
			<HoneycombBackdrop animated />

			{/* Flat veil on phones where the form covers everything; a pool centred on
			    the copy at `lg`, where the comb is on show. */}
			<div className='absolute inset-0 bg-background/60 lg:hidden' />
			<div className='absolute inset-0 hidden bg-[radial-gradient(70%_60%_at_35%_50%,rgba(13,15,13,0.94),transparent_75%)] lg:block' />
		</div>
	);
}
