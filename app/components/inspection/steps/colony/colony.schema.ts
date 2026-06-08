import z from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const COLONY_BEHAVIOR = ['calm', 'nervous', 'aggressive', 'swarm_mood'] as const;
export const COLONY_HONEY_STORES = ['sufficient', 'low', 'none'] as const;
export const COLONY_HIVE_SPACE = ['ok', 'tight', 'loose', 'added_super'] as const;

export const colonyObject = z.object({
	frames_covered: z
		.number('Podaj liczbę')
		.int('Podaj liczbę całkowitą')
		.min(0, 'Nie może być ujemne')
		.max(20, 'Maksymalnie 20'),
	behavior: z.enum(COLONY_BEHAVIOR, 'Wybierz zachowanie rodziny'),
	honey_stores: z.enum(COLONY_HONEY_STORES, 'Wybierz ilość zapasów'),
	hive_space: z.enum(COLONY_HIVE_SPACE, 'Wybierz ilość wolnego miejsca'),
	honey_kg: z.number('Podaj liczbę').min(0, 'Nie może być ujemne').max(200, 'Maksymalnie 200'),
});

// TODO Add this after pdf service schema update
// export const colonySchema = colonyObject.refine(
// 	(data) => !(data.honey_stores === 'none' && data.honey_kg > 0),
// 	{
// 		error: 'Przy braku zapasów miodu ilość nie może być większa niż 0',
// 		path: ['honey_kg'],
// 	},
// );

export type ColonyValues = z.infer<typeof colonyObject>;

export const colonyDefaults: DefaultValues<ColonyValues> = {
	frames_covered: 0,
	behavior: undefined,
	honey_stores: undefined,
	hive_space: undefined,
	honey_kg: 0,
};
