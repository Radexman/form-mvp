import { describe, expect, it } from 'vitest';

import { deriveComb, formatPl } from './comb.derive';
import { combSchema, type CombValues, type FrameValues } from './comb.schema';

/**
 * The comb block from the API author's reference payload. It carries its own
 * oracles: the brief states 1.6 frames x 2.25 kg = 3.6 kg, and the sample's own
 * notes say "Czerw na 3,3 ramki" and "Ramki 1 i 7 to stare plastry".
 */
const REFERENCE: CombValues = {
	frame_type: 'wielkopolska',
	slots: 10,
	low_confidence: false,
	frames: [
		{ position: 1, comb_state: 'drawn', brood: 0, honey: 6, pollen: 1, wear: 'old' },
		{ position: 2, comb_state: 'drawn', brood: 3, honey: 2, pollen: 3, wear: 'good' },
		{ position: 3, comb_state: 'drawn', brood: 8, honey: 1, pollen: 1, wear: 'good' },
		{ position: 4, comb_state: 'drawn', brood: 9, honey: 0, pollen: 1, wear: 'good' },
		{ position: 5, comb_state: 'drawn', brood: 8, honey: 1, pollen: 1, wear: 'good' },
		{ position: 6, comb_state: 'drawn', brood: 5, honey: 2, pollen: 1, wear: 'good' },
		{ position: 7, comb_state: 'drawn', brood: 0, honey: 4, pollen: 2, wear: 'old' },
		{ position: 8, comb_state: 'foundation', brood: 0, honey: 0, pollen: 0, wear: null },
	],
};

const frame = (overrides: Partial<FrameValues> = {}): FrameValues => ({
	position: 1,
	comb_state: 'drawn',
	brood: 0,
	honey: 0,
	pollen: 0,
	wear: 'good',
	...overrides,
});

describe('deriveComb against the reference payload', () => {
	const derived = deriveComb(REFERENCE);

	it('computes honey in kg from frame equivalents', () => {
		expect(derived.honey_frames_equiv).toBe(1.6);
		expect(derived.frame_capacity_kg).toBe(2.25);
		expect(derived.honey_kg).toBe(3.6);
	});

	it('matches the brood figure quoted in the sample notes', () => {
		expect(derived.brood_frames_equiv).toBe(3.3);
	});

	it('counts pollen, empty drawn comb and foundation separately', () => {
		expect(derived.pollen_frames_equiv).toBe(1);
		expect(derived.empty_frames_equiv).toBe(1.1);
		expect(derived.foundation_frames).toBe(1);
		expect(derived.occupied_frames).toBe(7);
	});

	it('takes the worst per-frame wear as the hive condition', () => {
		expect(derived.comb_condition).toBe('old');
	});

	it('classifies stores', () => {
		expect(derived.honey_stores).toBe('moderate');
	});
});

describe('honey_stores thresholds', () => {
	const withHoney = (tenths: number) => deriveComb({ ...REFERENCE, frames: [frame({ honey: tenths })] }).honey_stores;

	it('reports none when there is no honey at all', () => {
		expect(withHoney(0)).toBe('none');
	});

	// Below one full frame (2.25 kg) the colony has no buffer — feeding trigger.
	it('reports low below a full frame of stores', () => {
		expect(withHoney(9)).toBe('low');
		expect(withHoney(10)).toBe('moderate');
	});
});

describe('empty_frames_equiv', () => {
	it('excludes foundation, which is not yet comb', () => {
		const derived = deriveComb({
			...REFERENCE,
			frames: [frame({ comb_state: 'foundation', wear: null }), frame({ position: 2, honey: 4 })],
		});
		// Only the drawn frame's 6 empty tenths count.
		expect(derived.empty_frames_equiv).toBe(0.6);
	});
});

describe('unrated_frames', () => {
	it('counts drawn frames left without a wear assessment', () => {
		const derived = deriveComb({ ...REFERENCE, frames: [frame({ wear: null }), frame({ position: 2 })] });
		expect(derived.unrated_frames).toBe(1);
	});
});

describe('formatPl', () => {
	it('uses a decimal comma at fixed precision', () => {
		expect(formatPl(3.3)).toBe('3,3');
		expect(formatPl(1)).toBe('1,0');
		expect(formatPl(3.6, 2)).toBe('3,60');
	});
});

describe('combSchema mirrors the Pydantic validators', () => {
	it('accepts the reference payload', () => {
		expect(combSchema.safeParse(REFERENCE).success).toBe(true);
	});

	it('rejects a frame filled past ten tenths', () => {
		const result = combSchema.safeParse({ ...REFERENCE, frames: [frame({ brood: 6, honey: 5 })] });
		expect(result.success).toBe(false);
	});

	it('rejects foundation carrying resources', () => {
		const result = combSchema.safeParse({
			...REFERENCE,
			frames: [frame({ comb_state: 'foundation', honey: 3, wear: null })],
		});
		expect(result.success).toBe(false);
	});

	it('rejects an empty frame list', () => {
		expect(combSchema.safeParse({ ...REFERENCE, frames: [] }).success).toBe(false);
	});

	it('rejects more frames than slots', () => {
		expect(combSchema.safeParse({ ...REFERENCE, slots: 4 }).success).toBe(false);
	});

	it('rejects duplicate positions', () => {
		const frames = REFERENCE.frames.map((item) => ({ ...item, position: 1 }));
		expect(combSchema.safeParse({ ...REFERENCE, frames }).success).toBe(false);
	});
});
