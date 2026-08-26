import type { FormValues } from './schema';
import { COMB_SCHEMA_VERSION } from './steps/comb/comb.schema';
import type { InspectionContext } from '../../lib/inspection-context';

function emptyToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * The PDF service rejects unknown keys, so every block here is spelled out
 * field by field. In particular nothing derived may be sent: honey_kg,
 * honey_stores, comb_condition and the *_frames_equiv counts are computed
 * server-side from `comb.frames` (see comb.derive.ts for the display copy).
 */
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
			hive_space: data.hive_space,
		},
		comb: {
			schema_version: COMB_SCHEMA_VERSION,
			frame_type: data.frame_type,
			slots: data.slots,
			low_confidence: data.low_confidence,
			// Positions are renumbered from the list order — the box is read left to right.
			frames: data.frames.map((frame, index) => ({
				position: index + 1,
				comb_state: frame.comb_state,
				brood: frame.brood,
				honey: frame.honey,
				pollen: frame.pollen,
				wear: frame.wear ?? null,
			})),
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
