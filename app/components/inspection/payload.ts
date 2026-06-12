import type { FormValues } from './schema';
import type { InspectionContext } from '../../lib/inspection-context';

function emptyToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function buildInspectionPayload(data: FormValues, context: InspectionContext) {
	return {
		meta: context.meta,
		weather: context.weather,
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
			other: emptyToNull(data.health_other),
		},
		notes: emptyToNull(data.notes),
	};
}
