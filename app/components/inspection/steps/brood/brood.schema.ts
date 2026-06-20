import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const BROOD_TYPE = ['eggs', 'open', 'capped', 'drone'] as const;

export const BROOD_TYPE_OPTIONS = [
	{ value: 'eggs', label: 'Jaja' },
	{ value: 'open', label: 'Otwarty (larwy)' },
	{ value: 'capped', label: 'Kryty' },
	{ value: 'drone', label: 'Trutowy' },
];

export const broodObject = z.object({
	brood_types: z.array(z.enum(BROOD_TYPE)),
	brood_pattern: z
		.number('Wybierz zwartość czerwiu')
		.int('Podaj liczbę całkowitą')
		.min(1, 'Wybierz zwartość czerwiu')
		.max(5, 'Maksymalnie 5'),
});

export const broodSchema = broodObject;

export type BroodValues = z.infer<typeof broodObject>;

export const broodDefaults: DefaultValues<BroodValues> = {
	brood_types: [],
	brood_pattern: undefined,
};

export const broodStep = { key: 'brood', title: 'Czerw' } as const;
