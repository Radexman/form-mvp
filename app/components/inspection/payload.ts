import type { FormValues } from './schema';

// The form does not yet collect apiary/hive identification or weather. Until apiary
// selection and the Open-Meteo lookup are wired up, the header is stubbed and weather
// is sent as null (the backend and PDF template both accept a missing weather block).
// TODO: replace with the selected apiary/hive and a real weather fetch.
const PLACEHOLDER_META = {
	apiary_name: 'Pasieka testowa',
	beekeeper_name: 'Jan Kowalski',
	veterinary_number: 'PL00000000',
	hive_number: '1',
	inspection_number: '1',
};

function emptyToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/** Reshapes the flat form state into the nested payload expected by /generate-pdf. */
export function buildInspectionPayload(data: FormValues) {
	return {
		meta: {
			...PLACEHOLDER_META,
			inspection_date: new Date().toISOString().slice(0, 10),
		},
		weather: null,
		queen: {
			queen_status: data.queen_status,
			queen_marked: data.queen_marked,
			queen_marker_color: data.queen_marker_color,
			queen_cells: data.queen_cells,
			queen_cells_count: data.queen_cells_count,
		},
		brood: {
			brood_types: data.brood_types,
			brood_pattern: data.brood_pattern,
		},
		colony: {
			frames_covered: data.frames_covered,
			behavior: data.behavior,
			honey_stores: data.honey_stores,
			hive_space: data.hive_space,
			honey_kg: data.honey_kg,
		},
		comb: {
			frames_brood: data.frames_brood,
			frames_honey: data.frames_honey,
			frames_pollen: data.frames_pollen,
			frames_empty: data.frames_empty,
			comb_condition: data.comb_condition,
		},
		actions: {
			selected: data.selected,
			other: emptyToNull(data.other),
		},
		health: {
			conditions: data.conditions,
			varroa_drop_count: data.varroa_drop_count,
			// `health_other` is the flat-form alias for `health.other` (avoids colliding with actions.other).
			other: emptyToNull(data.health_other),
		},
		notes: emptyToNull(data.notes),
	};
}
