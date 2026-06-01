import { z } from 'zod';
import type { DefaultValues, FieldPath } from 'react-hook-form';

export const QUEEN_STATUS = ['seen', 'not_seen_brood_ok', 'missing'] as const;
export const QUEEN_MARKER_COLOR = ['white', 'yellow', 'red', 'green', 'blue'] as const;
export const QUEEN_CELLS = ['none', 'emergency', 'swarm', 'supersedure'] as const;

const queenObject = z.object({
	queen_status: z.enum(QUEEN_STATUS, { message: 'Wybierz status matki' }),
	queen_marked: z.boolean(),
	queen_marker_color: z.enum(QUEEN_MARKER_COLOR).nullable(),
	queen_cells: z.enum(QUEEN_CELLS, { message: 'Wybierz rodzaj mateczników' }),
	queen_cells_count: z
		.number({ message: 'Podaj liczbę' })
		.int('Liczba całkowita')
		.min(0, 'Nie może być ujemne')
		.max(50, 'Maksymalnie 50'),
});

export const queenSchema = queenObject
	.refine((data) => !(data.queen_marked && data.queen_marker_color === null), {
		message: 'Znakowana matka musi mieć kolor',
		path: ['queen_marker_color'],
	})
	.refine((data) => !(!data.queen_marked && data.queen_marker_color !== null), {
		message: 'Nieznakowana matka nie może mieć koloru',
		path: ['queen_marker_color'],
	})
	.refine((data) => data.queen_cells === 'none' || data.queen_cells_count >= 1, {
		message: 'Przy obecności mateczników liczba musi wynosić co najmniej 1',
		path: ['queen_cells_count'],
	});

export const STEP_META = [{ key: 'queen', title: 'Matka', schema: queenSchema, object: queenObject }] as const;

export const fullSchema = queenSchema;

export type FormValues = z.infer<typeof fullSchema>;

export const stepFields: FieldPath<FormValues>[][] = STEP_META.map(
	(meta) => Object.keys(meta.object.shape) as FieldPath<FormValues>[],
);

export const defaultValues: DefaultValues<FormValues> = {
	queen_status: undefined,
	queen_marked: false,
	queen_marker_color: null,
	queen_cells: undefined,
	queen_cells_count: 0,
};
