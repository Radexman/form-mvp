import { describe, expect, it } from 'vitest';

import { buildInspectionPayload } from './payload';
import { defaultValues, type FormValues } from './schema';
import type { FrameValues } from './steps/comb/comb.schema';

/**
 * The PDF service rejects unknown keys, so these tests pin the exact shape of
 * every block against the reference payload from the API author. Nothing
 * derived may appear: honey_kg, honey_stores, comb_condition and the
 * *_frames_equiv counts are all computed server-side from comb.frames.
 */
const REFERENCE_KEYS = {
	root: ['meta', 'weather', 'queen', 'brood', 'colony', 'comb', 'actions', 'health', 'notes'],
	queen: ['queen_status', 'queen_marked', 'queen_marker_color', 'queen_cells', 'queen_cells_count'],
	brood: ['brood_types', 'brood_pattern'],
	colony: ['frames_covered', 'behavior', 'hive_space'],
	comb: ['schema_version', 'frame_type', 'slots', 'low_confidence', 'frames'],
	frame: ['position', 'comb_state', 'brood', 'honey', 'pollen', 'wear'],
	actions: ['selected', 'other'],
	health: ['conditions', 'varroa_drop_count', 'other'],
};

const meta = {
	apiary_name: 'Pasieka Siek',
	beekeeper_name: 'Radosław Siek',
	veterinary_number: '160947166',
	hive_number: '5',
	inspection_number: '2',
	inspection_date: '2026-04-18',
};

const frames: FrameValues[] = [
	{ position: 1, comb_state: 'drawn', brood: 0, honey: 6, pollen: 1, wear: 'old' },
	{ position: 2, comb_state: 'foundation', brood: 0, honey: 0, pollen: 0, wear: null },
];

const data = {
	...defaultValues,
	queen_status: 'seen',
	queen_marked: true,
	queen_marker_color: 'blue',
	queen_cells: 'none',
	queen_cells_count: 0,
	brood_types: ['eggs', 'open', 'capped'],
	brood_pattern: 4,
	frames_covered: 7,
	behavior: 'calm',
	hive_space: 'ok',
	frame_type: 'wielkopolska',
	slots: 10,
	low_confidence: false,
	frames,
	selected: ['feeding_syrup'],
	other: '   ',
	condition_observed: true,
	conditions: ['varroa'],
	varroa_drop_count: 12,
	health_other: '',
	notes: 'Test',
} as unknown as FormValues;

const payload = buildInspectionPayload(data, { meta, weather: null });

describe('payload block shapes', () => {
	it('sends exactly the reference top-level blocks', () => {
		expect(Object.keys(payload).sort()).toEqual([...REFERENCE_KEYS.root].sort());
	});

	it.each([
		['queen', REFERENCE_KEYS.queen],
		['brood', REFERENCE_KEYS.brood],
		['colony', REFERENCE_KEYS.colony],
		['comb', REFERENCE_KEYS.comb],
		['actions', REFERENCE_KEYS.actions],
		['health', REFERENCE_KEYS.health],
	])('sends exactly the reference keys for %s', (block, keys) => {
		expect(Object.keys(payload[block as keyof typeof payload] as object).sort()).toEqual([...keys].sort());
	});

	it('sends exactly the reference keys per frame', () => {
		for (const frame of payload.comb.frames) {
			expect(Object.keys(frame).sort()).toEqual([...REFERENCE_KEYS.frame].sort());
		}
	});
});

describe('payload values', () => {
	it('omits the fields the service now derives', () => {
		const colony = payload.colony as Record<string, unknown>;
		expect(colony.honey_kg).toBeUndefined();
		expect(colony.honey_stores).toBeUndefined();
		expect((payload.comb as Record<string, unknown>).comb_condition).toBeUndefined();
	});

	it('declares the schema version', () => {
		expect(payload.comb.schema_version).toBe(2);
	});

	it('renumbers positions from list order, so a reorder cannot drift', () => {
		const reordered = buildInspectionPayload({ ...data, frames: [...frames].reverse() } as unknown as FormValues, {
			meta,
			weather: null,
		});
		expect(reordered.comb.frames.map((frame) => frame.position)).toEqual([1, 2]);
		// Composition travels with the frame, not with the slot.
		expect(reordered.comb.frames[0].comb_state).toBe('foundation');
		expect(reordered.comb.frames[1].honey).toBe(6);
	});

	it('sends null rather than blank strings', () => {
		expect(payload.actions.other).toBeNull();
		expect(payload.health.other).toBeNull();
	});

	it('keeps foundation wear null', () => {
		expect(payload.comb.frames[1].wear).toBeNull();
	});
});
