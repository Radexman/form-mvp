import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const HEALTH_CONDITION = [
	'dwv',
	'foulbrood',
	'dysentery',
	'varroa',
	'chalkbrood',
	'acarine',
	'wax_moth',
	'other',
] as const;

export const healthObject = z.object({
	condition_observed: z.boolean(),
	conditions: z.array(z.enum(HEALTH_CONDITION)),
	varroa_drop_count: z
		.number('Podaj liczbę')
		.int('Podaj liczbę całkowitą')
		.min(0, 'Nie może być ujemne')
		.max(500, 'Maksymalnie 500')
		.nullable(),
	health_other: z.string().max(500, 'Maksymalnie 500 znaków'),
});

export const healthSchema = healthObject
	.refine((data) => !(data.conditions.includes('varroa') && data.varroa_drop_count === null), {
		error: 'Warroza wymaga podania osypu',
		path: ['varroa_drop_count'],
	})
	.refine((data) => !(!data.conditions.includes('varroa') && data.varroa_drop_count !== null), {
		error: 'Osyp wymaga zaznaczenia warrozy',
		path: ['varroa_drop_count'],
	})
	.refine((data) => !(data.conditions.includes('other') && data.health_other.trim().length === 0), {
		error: 'Opisz inny objaw',
		path: ['health_other'],
	})
	.refine((data) => !(!data.conditions.includes('other') && data.health_other.trim().length > 0), {
		error: 'Aby dodać opis, zaznacz „Inne”',
		path: ['health_other'],
	});

export type HealthValues = z.infer<typeof healthObject>;

export const healthDefaults: DefaultValues<HealthValues> = {
	condition_observed: false,
	conditions: [],
	varroa_drop_count: null,
	health_other: '',
};

export const healthStep = { key: 'health', title: 'Zdrowie rodziny' } as const;
