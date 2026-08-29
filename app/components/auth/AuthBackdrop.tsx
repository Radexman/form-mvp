/**
 * Decorative layer behind the auth screens: drifting honeycomb, wash, scrim.
 * Full-bleed on phones, left half from `lg`.
 *
 * Must be rendered exactly once per document — the comb is an SVG `<pattern>`
 * referenced by id.
 */

const SIDE = 20;
const HALF_HEIGHT = 17.32; // SIDE * √3 / 2
const HEX = `M ${-SIDE} 0 L ${-SIDE / 2} ${-HALF_HEIGHT} L ${SIDE / 2} ${-HALF_HEIGHT} L ${SIDE} 0 L ${SIDE / 2} ${HALF_HEIGHT} L ${-SIDE / 2} ${HALF_HEIGHT} Z`;

/** Interlocking tile: four corner cells plus one in the middle. */
const TILE = { width: SIDE * 3, height: HALF_HEIGHT * 2 };
const CELLS = [
	{ x: 0, y: 0 },
	{ x: TILE.width, y: 0 },
	{ x: 0, y: TILE.height },
	{ x: TILE.width, y: TILE.height },
	{ x: TILE.width / 2, y: TILE.height / 2 },
];

/**
 * The drift travels exactly one tile, which is what makes the loop seamless.
 * `--comb-tile` feeds the keyframes in `globals.css` so the two cannot diverge;
 * the extra width and negative offset keep the uncovered left edge drawn.
 */
const COMB_STYLE = {
	'--comb-tile': `${TILE.width}px`,
	left: `-${TILE.width}px`,
	width: `calc(100% + ${TILE.width}px)`,
} as React.CSSProperties;

const WASH =
	'bg-[radial-gradient(120%_100%_at_15%_10%,rgba(74,222,128,0.16),transparent_55%),radial-gradient(90%_70%_at_85%_95%,rgba(251,191,36,0.10),transparent_60%),linear-gradient(160deg,#101610_0%,#0d0f0d_60%,#0a0c0a_100%)]';

export function AuthBackdrop() {
	return (
		<div
			aria-hidden='true'
			// Without `overflow-hidden` the oversized svg becomes horizontal scroll.
			className={`pointer-events-none absolute inset-y-0 left-0 w-full overflow-hidden lg:w-1/2 ${WASH}`}
		>
			<svg
				style={COMB_STYLE}
				className='comb-drift absolute inset-y-0 h-full text-accent/6'
			>
				<defs>
					<pattern
						id='auth-comb'
						patternUnits='userSpaceOnUse'
						width={TILE.width}
						height={TILE.height}
					>
						{CELLS.map(({ x, y }) => (
							<path
								key={`${x}-${y}`}
								d={HEX}
								transform={`translate(${x} ${y})`}
								fill='none'
								stroke='currentColor'
								strokeWidth='1.5'
							/>
						))}
					</pattern>
				</defs>
				<rect
					width='100%'
					height='100%'
					fill='url(#auth-comb)'
				/>
			</svg>

			{/* Flat veil on phones where the form covers everything; a pool centred on
			    the copy at `lg`, where the comb is on show. */}
			<div className='absolute inset-0 bg-background/60 lg:hidden' />
			<div className='absolute inset-0 hidden bg-[radial-gradient(70%_60%_at_35%_50%,rgba(13,15,13,0.94),transparent_75%)] lg:block' />
		</div>
	);
}
