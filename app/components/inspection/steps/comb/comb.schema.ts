import z from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const COMB_CONDITION = ['good', 'old', 'needs_replacement'] as const;

export const COMB_CONDITION_OPTIONS = [
	{ value: 'good', label: 'Dobry' },
	{ value: 'old', label: 'Stare plastry' },
	{ value: 'needs_replacement', label: 'Potrzeba wymiany' },
];

export const combObject = z.object({
	frames_brood: z.number('Podaj liczbę').int('Podaj liczbę całkowitą').min(0, 'Nie może być ujemne'),
	frames_honey: z.number('Podaj liczbę').int('Podaj liczbę całkowitą').min(0, 'Nie może być ujemne'),
	frames_pollen: z.number('Podaj liczbę').int('Podaj liczbę całkowitą').min(0, 'Nie może być ujemne'),
	frames_empty: z.number('Podaj liczbę').int('Podaj liczbę całkowitą').min(0, 'Nie może być ujemne'),
	comb_condition: z.enum(COMB_CONDITION, 'Wybierz stan plastrów'),
});

export const combSchema = combObject.refine(
	({ frames_brood, frames_honey, frames_pollen, frames_empty }) =>
		frames_brood + frames_honey + frames_pollen + frames_empty > 0,
	{ error: 'Ul musi mieć przynajmniej jedną ramkę', path: ['frames_brood'] },
);

export type CombValues = z.infer<typeof combObject>;

export const combDefaults: DefaultValues<CombValues> = {
	frames_brood: 0,
	frames_honey: 0,
	frames_pollen: 0,
	frames_empty: 0,
	comb_condition: undefined,
};

export const combStep = { key: 'comb', title: 'Plastry i zasoby' } as const;
