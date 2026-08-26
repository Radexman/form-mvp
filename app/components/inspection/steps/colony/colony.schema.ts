import z from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const COLONY_BEHAVIOR = ['calm', 'nervous', 'aggressive', 'swarm_mood'] as const;
export const COLONY_HIVE_SPACE = ['ok', 'tight', 'loose', 'added_super'] as const;

export const COLONY_BEHAVIOR_OPTIONS = [
	{ value: 'calm', label: 'Spokojne' },
	{ value: 'nervous', label: 'Nerwowe' },
	{ value: 'aggressive', label: 'Agresywne' },
	{ value: 'swarm_mood', label: 'Nastrój rojowy' },
];

export const COLONY_HIVE_SPACE_OPTIONS = [
	{ value: 'ok', label: 'Wystarczająca' },
	{ value: 'tight', label: 'Ciasno' },
	{ value: 'loose', label: 'Luźno' },
	{ value: 'added_super', label: 'Nadstawka' },
];

export const colonyObject = z.object({
	frames_covered: z
		.number('Podaj liczbę')
		.int('Podaj liczbę całkowitą')
		.min(0, 'Nie może być ujemne')
		.max(20, 'Maksymalnie 20'),
	behavior: z.enum(COLONY_BEHAVIOR, 'Wybierz zachowanie rodziny'),
	hive_space: z.enum(COLONY_HIVE_SPACE, 'Wybierz ilość wolnego miejsca'),
});

// honey_stores and honey_kg used to live here as manual inputs. Both are now
// derived by the service from the per-frame comb composition, so the form must
// not collect (or send) them.
export const colonySchema = colonyObject;

export type ColonyValues = z.infer<typeof colonyObject>;

export const colonyDefaults: DefaultValues<ColonyValues> = {
	frames_covered: 0,
	behavior: undefined,
	hive_space: undefined,
};

export const colonyStep = { key: 'colony', title: 'Rodzina' } as const;
