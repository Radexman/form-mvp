import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const ACTION_TYPE = [
	'feeding_syrup',
	'feeding_candy',
	'feeding_pollen',
	'feeding_water',
	'comb_added_drawn',
	'comb_added_foundation',
	'comb_removed_old',
	'comb_removed_drone',
	'uncapping',
	'super_added',
	'super_removed',
	'division_board_moved',
	'hive_expanded',
	'honey_harvest',
	'honey_frames_returned',
	'queen_introduced',
	'queen_removed',
	'queen_cell_added',
	'queen_cells_removed',
	'swarm_caught',
	'split_made',
	'treatment_oxalic_acid',
	'treatment_formic_acid',
	'treatment_apistan',
	'treatment_apivar',
	'treatment_other_varroa',
	'treatment_nosema',
	'treatment_other',
	'hive_cleaned',
	'hive_moved',
	'entrance_reduced',
	'entrance_opened',
	'mouse_guard_added',
	'mouse_guard_removed',
	'insulation_added',
	'insulation_removed',
] as const;

export const actionsObject = z.object({
	selected: z.array(z.enum(ACTION_TYPE)),
	other: z.string().max(500, 'Maksymalnie 500 znaków'),
});

export const actionsSchema = actionsObject;

export type ActionsValues = z.infer<typeof actionsObject>;

export const actionsDefaults: DefaultValues<ActionsValues> = {
	selected: [],
	other: '',
};

export const actionsStep = { key: 'actions', title: 'Wykonane działania' } as const;
