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

export const ACTION_OPTIONS = [
	{ group: 'Karmienie', value: 'feeding_syrup', label: 'Podkarmianie syropem' },
	{ group: 'Karmienie', value: 'feeding_candy', label: 'Podkarmianie ciastem' },
	{ group: 'Karmienie', value: 'feeding_pollen', label: 'Podkarmianie pierzgą/pyłkiem' },
	{ group: 'Karmienie', value: 'feeding_water', label: 'Pojenie wodą' },

	{ group: 'Plastry', value: 'comb_added_drawn', label: 'Dodanie odbudowanego plastra' },
	{ group: 'Plastry', value: 'comb_added_foundation', label: 'Dodanie węzy' },
	{ group: 'Plastry', value: 'comb_removed_old', label: 'Usunięcie starego plastra' },
	{ group: 'Plastry', value: 'comb_removed_drone', label: 'Wycięcie plastra trutowego' },
	{ group: 'Plastry', value: 'uncapping', label: 'Odsklepianie' },

	{ group: 'Nadstawki i przestrzeń', value: 'super_added', label: 'Dodanie nadstawki' },
	{ group: 'Nadstawki i przestrzeń', value: 'super_removed', label: 'Zdjęcie nadstawki' },
	{ group: 'Nadstawki i przestrzeń', value: 'division_board_moved', label: 'Przesunięcie zatworu' },
	{ group: 'Nadstawki i przestrzeń', value: 'hive_expanded', label: 'Poszerzenie gniazda' },

	{ group: 'Miód', value: 'honey_harvest', label: 'Odbiór miodu' },
	{ group: 'Miód', value: 'honey_frames_returned', label: 'Zwrot ramek po miodobraniu' },

	{ group: 'Matka i rozmnażanie', value: 'queen_introduced', label: 'Wprowadzenie matki' },
	{ group: 'Matka i rozmnażanie', value: 'queen_removed', label: 'Usunięcie matki' },
	{ group: 'Matka i rozmnażanie', value: 'queen_cell_added', label: 'Dodanie matecznika' },
	{ group: 'Matka i rozmnażanie', value: 'queen_cells_removed', label: 'Usunięcie mateczników' },
	{ group: 'Matka i rozmnażanie', value: 'swarm_caught', label: 'Złapanie roju' },
	{ group: 'Matka i rozmnażanie', value: 'split_made', label: 'Wykonanie odkładu' },

	{ group: 'Leczenie', value: 'treatment_oxalic_acid', label: 'Leczenie kwasem szczawiowym' },
	{ group: 'Leczenie', value: 'treatment_formic_acid', label: 'Leczenie kwasem mrówkowym' },
	{ group: 'Leczenie', value: 'treatment_apistan', label: 'Leczenie Apistanem' },
	{ group: 'Leczenie', value: 'treatment_apivar', label: 'Leczenie Apivarem' },
	{ group: 'Leczenie', value: 'treatment_other_varroa', label: 'Inne leczenie warrozy' },
	{ group: 'Leczenie', value: 'treatment_nosema', label: 'Leczenie nosemozy' },
	{ group: 'Leczenie', value: 'treatment_other', label: 'Inne leczenie' },

	{ group: 'Obsługa ula', value: 'hive_cleaned', label: 'Czyszczenie ula' },
	{ group: 'Obsługa ula', value: 'hive_moved', label: 'Przeniesienie ula' },
	{ group: 'Obsługa ula', value: 'entrance_reduced', label: 'Zwężenie wylotka' },
	{ group: 'Obsługa ula', value: 'entrance_opened', label: 'Otwarcie wylotka' },

	{
		group: 'Zabezpieczenia i zimowanie',
		value: 'mouse_guard_added',
		label: 'Założenie zabezpieczenia przed myszami',
	},
	{
		group: 'Zabezpieczenia i zimowanie',
		value: 'mouse_guard_removed',
		label: 'Zdjęcie zabezpieczenia przed myszami',
	},
	{ group: 'Zabezpieczenia i zimowanie', value: 'insulation_added', label: 'Założenie ocieplenia' },
	{ group: 'Zabezpieczenia i zimowanie', value: 'insulation_removed', label: 'Zdjęcie ocieplenia' },
];

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
