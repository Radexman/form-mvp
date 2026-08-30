import { describe, expect, it } from 'vitest';

import { HONEYCOMB_TILE, honeycombMaskUri, honeycombTileHeight } from './honeycomb';

const PREFIX = 'data:image/svg+xml,';

function decodedSvg(): string {
	return decodeURIComponent(honeycombMaskUri().slice(PREFIX.length));
}

describe('HONEYCOMB_TILE', () => {
	it('keeps the reference tile at 60 × 34.641', () => {
		expect(HONEYCOMB_TILE.width).toBe(60);
		expect(HONEYCOMB_TILE.height).toBeCloseTo(34.641, 3);
	});

	it('is √3 / 3 tall relative to its width', () => {
		expect(HONEYCOMB_TILE.height / HONEYCOMB_TILE.width).toBeCloseTo(Math.sqrt(3) / 3, 4);
	});
});

describe('honeycombTileHeight', () => {
	it('returns the reference height for the reference width', () => {
		expect(honeycombTileHeight(HONEYCOMB_TILE.width)).toBe(HONEYCOMB_TILE.height);
	});

	it('scales linearly', () => {
		expect(honeycombTileHeight(120)).toBeCloseTo(HONEYCOMB_TILE.height * 2, 3);
		expect(honeycombTileHeight(30)).toBeCloseTo(HONEYCOMB_TILE.height / 2, 3);
	});

	it('preserves the aspect ratio at the sizes the call sites use', () => {
		for (const width of [40, 44, 64]) {
			expect(honeycombTileHeight(width) / width).toBeCloseTo(Math.sqrt(3) / 3, 4);
		}
	});

	it('returns 0 for a 0 width rather than NaN', () => {
		expect(honeycombTileHeight(0)).toBe(0);
	});
});

describe('honeycombMaskUri', () => {
	it('is an svg data URI', () => {
		expect(honeycombMaskUri().startsWith(PREFIX)).toBe(true);
	});

	// An unencoded `#` truncates the URI at the fragment and the mask silently
	// resolves to nothing — no console error, no failed request.
	it('encodes every character that would break a css url()', () => {
		const payload = honeycombMaskUri().slice(PREFIX.length);

		for (const char of ['#', '<', '>', '"', ' ', "'", '(', ')']) {
			expect(payload).not.toContain(char);
		}
	});

	it('round-trips to well-formed svg', () => {
		const svg = decodedSvg();

		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);
	});

	it('sizes the svg to the tile it will be repeated at', () => {
		const svg = decodedSvg();

		expect(svg).toContain(`width="${HONEYCOMB_TILE.width}"`);
		expect(svg).toContain(`height="${HONEYCOMB_TILE.height}"`);
		expect(svg).toContain(`viewBox="0 0 ${HONEYCOMB_TILE.width} ${HONEYCOMB_TILE.height}"`);
	});

	it('draws the four corner cells and the middle one', () => {
		const svg = decodedSvg();

		expect(svg.match(/<path /g)).toHaveLength(5);
		expect(svg).toContain('translate(0 0)');
		expect(svg).toContain(`translate(${HONEYCOMB_TILE.width} 0)`);
		expect(svg).toContain(`translate(0 ${HONEYCOMB_TILE.height})`);
		expect(svg).toContain(`translate(${HONEYCOMB_TILE.width} ${HONEYCOMB_TILE.height})`);
		expect(svg).toContain(`translate(${HONEYCOMB_TILE.width / 2} ${HONEYCOMB_TILE.height / 2})`);
	});

	// mask-image reads alpha, so an unstroked or filled cell masks the wrong half.
	it('strokes opaquely and never fills', () => {
		const svg = decodedSvg();

		expect(svg.match(/fill="none"/g)).toHaveLength(5);
		expect(svg.match(/stroke="black"/g)).toHaveLength(5);
		expect(svg).not.toContain('opacity');
	});

	it('takes the stroke width from its argument', () => {
		expect(decodedSvg()).toContain('stroke-width="1.5"');
		expect(decodeURIComponent(honeycombMaskUri(3).slice(PREFIX.length))).toContain('stroke-width="3"');
	});
});
