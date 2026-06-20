import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const QUEEN_STATUS = ['seen', 'not_seen_brood_ok', 'missing'] as const;
export const QUEEN_MARKER_COLOR = ['white', 'yellow', 'red', 'green', 'blue'] as const;
export const QUEEN_CELLS = ['none', 'emergency', 'swarm', 'supersedure'] as const;

export const QUEEN_STATUS_OPTIONS = [
	{ value: 'seen', label: 'Widziana' },
	{ value: 'not_seen_brood_ok', label: 'Niewidziana, czerw OK' },
	{ value: 'missing', label: 'Brak matki' },
];

export const QUEEN_MARKER_COLOR_OPTIONS = [
	{ value: 'white', label: 'Biały' },
	{ value: 'yellow', label: 'Żółty' },
	{ value: 'red', label: 'Czerwony' },
	{ value: 'green', label: 'Zielony' },
	{ value: 'blue', label: 'Niebieski' },
];

export const QUEEN_CELLS_OPTIONS = [
	{ value: 'none', label: 'Brak' },
	{ value: 'emergency', label: 'Ratunkowe' },
	{ value: 'swarm', label: 'Rojowe' },
	{ value: 'supersedure', label: 'Cicha wymiana' },
];

export const queenObject = z.object({
	queen_status: z.enum(QUEEN_STATUS, 'Wybierz status matki'),
	queen_marked: z.boolean(),
	queen_marker_color: z.enum(QUEEN_MARKER_COLOR).nullable(),
	queen_cells: z.enum(QUEEN_CELLS, 'Wybierz rodzaj mateczników'),
	queen_cells_count: z
		.number('Podaj liczbę')
		.int('Podaj liczbę całkowitą')
		.min(0, 'Nie może być ujemne')
		.max(50, 'Maksymalnie 50'),
});

export const queenSchema = queenObject
	.refine((data) => !(data.queen_marked && data.queen_marker_color === null), {
		error: 'Znakowana matka musi mieć kolor',
		path: ['queen_marker_color'],
	})
	.refine((data) => !(!data.queen_marked && data.queen_marker_color !== null), {
		error: 'Nieznakowana matka nie może mieć koloru',
		path: ['queen_marker_color'],
	})
	.refine((data) => data.queen_cells === 'none' || data.queen_cells_count >= 1, {
		error: 'Przy obecności mateczników liczba musi wynosić co najmniej 1',
		path: ['queen_cells_count'],
	})
	.refine((data) => data.queen_status !== 'missing' || !data.queen_marked, {
		error: 'Brakująca matka nie może być znakowana',
		path: ['queen_marked'],
	});

export type QueenValues = z.infer<typeof queenObject>;

export const queenDefaults: DefaultValues<QueenValues> = {
	queen_status: undefined,
	queen_marked: false,
	queen_marker_color: null,
	queen_cells: undefined,
	queen_cells_count: 0,
};

export const queenStep = { key: 'queen', title: 'Matka' } as const;
