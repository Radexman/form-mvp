import { HONEYCOMB_TILE, honeycombMaskUri, honeycombTileHeight } from '@/app/lib/honeycomb';

export type HoneycombFade = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Each value names the region the pattern fades away in. */
const FADE: Record<HoneycombFade, string> = {
	top: 'linear-gradient(to bottom, transparent 0%, black 55%)',
	bottom: 'linear-gradient(to bottom, black 45%, transparent 100%)',
	left: 'linear-gradient(to right, transparent 0%, black 60%)',
	right: 'linear-gradient(to right, black 40%, transparent 100%)',
	center: 'radial-gradient(58% 55% at 50% 50%, transparent 0%, black 80%)',
};

const MASK = `url("${honeycombMaskUri()}")`;

interface HoneycombBackdropProps {
	/** Positioning overrides. The layer is `absolute inset-0` by default. */
	className?: string;
	/** Any background utility — the mask is tinted by it, so tokens still apply. */
	tone?: string;
	/**
	 * Not the 0.06 the pre-mask stroke used: adjacent cells share every edge, so
	 * that version painted each one twice and read as ~0.12. The mask paints once.
	 */
	opacity?: number;
	/** Tile width in px; the height follows the fixed aspect ratio. */
	tile?: number;
	fade?: HoneycombFade;
	/** The drifting loop. Auth screens only — everywhere else is still. */
	animated?: boolean;
	/** Full-strength red, for finding and tuning a layer in the browser. */
	debug?: boolean;
}

/**
 * Decorative honeycomb, safe to render many times in one document.
 *
 * The host element must be `relative isolate overflow-hidden`: the layer sits at
 * `-z-10` so page content stays above it without every sibling needing
 * `relative`, and without `isolate` that negative index escapes the host and
 * hides the comb behind an ancestor's background.
 */
export function HoneycombBackdrop({
	className = '',
	tone = 'bg-accent',
	opacity = 0.12,
	tile = HONEYCOMB_TILE.width,
	fade,
	animated = false,
	debug = false,
}: HoneycombBackdropProps) {
	// One tile of travel is what makes the drift seamless, so the layer is a tile
	// wider than its host and starts a tile to the left.
	const drift = animated ? { '--comb-tile': `${tile}px`, left: `-${tile}px`, width: `calc(100% + ${tile}px)` } : null;

	return (
		<div
			aria-hidden='true'
			data-honeycomb={animated ? 'animated' : 'static'}
			className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
			style={fade ? { maskImage: FADE[fade], WebkitMaskImage: FADE[fade] } : undefined}
		>
			<div
				className={`absolute inset-y-0 left-0 w-full ${debug ? 'bg-danger' : tone} ${animated ? 'comb-drift' : ''}`}
				style={
					{
						maskImage: MASK,
						WebkitMaskImage: MASK,
						maskSize: `${tile}px ${honeycombTileHeight(tile)}px`,
						WebkitMaskSize: `${tile}px ${honeycombTileHeight(tile)}px`,
						opacity: debug ? 1 : opacity,
						...drift,
					} as React.CSSProperties
				}
			/>
		</div>
	);
}
