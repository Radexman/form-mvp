import { z } from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const BROOD_TYPE = ['eggs', 'open', 'capped', 'drone'] as const;

export const broodObject = z.object({
	brood_types: z.array(z.enum(BROOD_TYPE)),
	brood_pattern: z
		.number({ message: 'Wybierz zwartość czerwiu' })
		.int('Liczba całkowita')
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
