import { describe, expect, it } from 'vitest';

import type { FrameValues } from '../../components/inspection/steps/comb/comb.schema';
import { applyFrameCommand } from './applyFrameCommand';
import { parseCommand, type FrameCommand } from './grammar';

const draft = (overrides: Partial<FrameValues> = {}): FrameValues => ({
	position: 1,
	comb_state: 'drawn',
	brood: 0,
	honey: 0,
	pollen: 0,
	wear: 'good',
	...overrides,
});

/** Parse a real utterance, so the tests exercise grammar and merge together. */
const spoken = (text: string): FrameCommand => {
	const command = parseCommand(text);
	if (!command || command.kind !== 'frame') throw new Error(`not a frame command: ${text}`);
	return command;
};

const applied = (from: FrameValues, text: string) => {
	const result = applyFrameCommand(from, spoken(text));
	if (!result.ok) throw new Error(`refused: ${result.reason}`);
	return result.frame;
};

describe('merging resources', () => {
	it('sets the named resources and leaves the rest', () => {
		expect(applied(draft(), 'miód 8 pierzga 1')).toMatchObject({ honey: 8, pollen: 1, brood: 0 });
	});

	it('amends only what is named, so corrections are surgical', () => {
		const existing = draft({ brood: 8, honey: 1, pollen: 1 });
		expect(applied(existing, 'czerw 7')).toMatchObject({ brood: 7, honey: 1, pollen: 1 });
	});
});

describe('overflow', () => {
	it('refuses more than a full frame rather than writing it', () => {
		const result = applyFrameCommand(draft(), spoken('czerw 8 miód 5'));
		expect(result).toEqual({ ok: false, reason: 'overflow', total: 13 });
	});

	it('allows exactly a full frame', () => {
		expect(applied(draft(), 'czerw 8 miód 1 pierzga 1')).toMatchObject({ brood: 8, honey: 1, pollen: 1 });
	});
});

describe('foundation', () => {
	it('clears the frame and drops wear', () => {
		const existing = draft({ brood: 5, honey: 2, wear: 'old' });
		expect(applied(existing, 'węza')).toMatchObject({
			comb_state: 'foundation',
			brood: 0,
			honey: 0,
			pollen: 0,
			wear: null,
		});
	});

	// A mis-heard "węza" has to be correctable by voice, or the beekeeper is
	// forced back to the screen mid-inspection.
	it('reverts to drawn when a resource is named on a foundation frame', () => {
		const misheard = draft({ comb_state: 'foundation', wear: null });
		expect(applied(misheard, 'miód 8')).toMatchObject({
			comb_state: 'drawn',
			honey: 8,
			wear: 'good',
		});
	});
});

describe('wear', () => {
	it('amends wear without touching resources', () => {
		const existing = draft({ honey: 4, pollen: 2 });
		expect(applied(existing, 'stary')).toMatchObject({ honey: 4, pollen: 2, wear: 'old' });
	});

	it('defaults drawn comb to good rather than leaving it unrated', () => {
		expect(applied(draft({ wear: null }), 'miód 3')).toMatchObject({ wear: 'good' });
	});
});

describe('empty', () => {
	it('zeroes every resource', () => {
		const existing = draft({ brood: 8, honey: 1, pollen: 1 });
		expect(applied(existing, 'pusta')).toMatchObject({
			comb_state: 'drawn',
			brood: 0,
			honey: 0,
			pollen: 0,
		});
	});
});
