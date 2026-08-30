/**
 * Geometry and mask source for the honeycomb backdrop. Kept apart from the
 * component so the tile maths is testable and so the SVG string is built once.
 */

const SIDE = 20;
const HALF_HEIGHT = SIDE * (Math.sqrt(3) / 2);

/** Reference tile: four corner cells plus one in the middle, interlocking. */
export const HONEYCOMB_TILE = {
	width: round(SIDE * 3),
	height: round(HALF_HEIGHT * 2),
} as const;

const CELLS = [
	{ x: 0, y: 0 },
	{ x: HONEYCOMB_TILE.width, y: 0 },
	{ x: 0, y: HONEYCOMB_TILE.height },
	{ x: HONEYCOMB_TILE.width, y: HONEYCOMB_TILE.height },
	{ x: HONEYCOMB_TILE.width / 2, y: HONEYCOMB_TILE.height / 2 },
];

const HEX = [
	`M ${-SIDE} 0`,
	`L ${-SIDE / 2} ${round(-HALF_HEIGHT)}`,
	`L ${SIDE / 2} ${round(-HALF_HEIGHT)}`,
	`L ${SIDE} 0`,
	`L ${SIDE / 2} ${round(HALF_HEIGHT)}`,
	`L ${-SIDE / 2} ${round(HALF_HEIGHT)}`,
	'Z',
].join(' ');

function round(value: number): number {
	return Math.round(value * 1e4) / 1e4;
}

/** Height that keeps a tile of `width` in the reference aspect ratio (√3 / 3). */
export function honeycombTileHeight(width: number): number {
	return round((width * HONEYCOMB_TILE.height) / HONEYCOMB_TILE.width);
}

/**
 * The comb as a CSS mask source. Stroke colour is irrelevant — `mask-image`
 * reads alpha — so the caller tints with a background colour and the pattern
 * stays driven by the design tokens instead of a hex baked into a URI.
 */
export function honeycombMaskUri(strokeWidth = 1.5): string {
	const paths = CELLS.map(
		({ x, y }) =>
			`<path d="${HEX}" transform="translate(${x} ${y})" fill="none" stroke="black" stroke-width="${strokeWidth}"/>`,
	).join('');

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${HONEYCOMB_TILE.width}" height="${HONEYCOMB_TILE.height}"` +
		` viewBox="0 0 ${HONEYCOMB_TILE.width} ${HONEYCOMB_TILE.height}">${paths}</svg>`;

	// Whole-string encoding, not a hand-picked escape list: an unencoded `#` in
	// any future colour would truncate the URI at the fragment and the pattern
	// would vanish with no error anywhere. `encodeURIComponent` spares the
	// parentheses every `translate()` carries, which only survive inside a quoted
	// `url()` — so they go too, and the result is safe either way.
	const payload = encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27');

	return `data:image/svg+xml,${payload}`;
}
