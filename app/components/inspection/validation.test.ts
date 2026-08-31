import { describe, expect, it } from 'vitest';
import type { FieldErrors } from 'react-hook-form';

import { STEP_META, stepFields, type FormValues } from './schema';
import { describeInvalidSteps, markValidatedSteps, stepOfField, stepsWithErrors } from './validation';

const COMB = STEP_META.findIndex((meta) => meta.key === 'comb');
const QUEEN = STEP_META.findIndex((meta) => meta.key === 'queen');
const BROOD = STEP_META.findIndex((meta) => meta.key === 'brood');

/** Only the shape stepsWithErrors reads — a message per failing field. */
function errors(...names: string[]): FieldErrors<FormValues> {
	return Object.fromEntries(names.map((name) => [name, { type: 'custom', message: 'nie' }]));
}

describe('locating the step a field belongs to', () => {
	it('finds the step that owns it', () => {
		expect(stepOfField('queen_marker_color')).toBe(QUEEN);
		expect(stepOfField('brood_pattern')).toBe(BROOD);
	});

	it('credits a nested path to the step that owns its root', () => {
		expect(stepOfField('frames.0.brood')).toBe(COMB);
	});

	it('returns -1 for a name no step owns', () => {
		expect(stepOfField('root')).toBe(-1);
	});
});

describe('naming the sections that failed', () => {
	it('reports the steps the errors fall on, in stepper order', () => {
		expect(stepsWithErrors(errors('brood_pattern', 'queen_marker_color'))).toEqual([QUEEN, BROOD]);
	});

	it('counts a step once however many of its fields failed', () => {
		expect(stepsWithErrors(errors('queen_marker_color', 'queen_cells_count'))).toEqual([QUEEN]);
	});

	it('names one section', () => {
		expect(describeInvalidSteps([QUEEN])).toBe('Popraw błędy w sekcji: Matka.');
	});

	it('names several', () => {
		expect(describeInvalidSteps([QUEEN, BROOD])).toBe('Popraw błędy w sekcjach: Matka i Czerw.');
		expect(describeInvalidSteps([COMB, QUEEN, BROOD])).toBe(
			'Popraw błędy w sekcjach: Plastry i zasoby, Matka i Czerw.',
		);
	});

	it('still says something when the error belongs to no step', () => {
		expect(describeInvalidSteps([])).toContain('Formularz zawiera błędy');
		expect(stepsWithErrors(errors('root'))).toEqual([]);
	});
});

describe('marking walked steps', () => {
	it('marks only the steps that validate', async () => {
		const marks = new Set<number>();
		await markValidatedSteps(BROOD + 1, marks, async (fields) => fields !== stepFields[QUEEN]);

		expect(marks.has(COMB)).toBe(true);
		expect(marks.has(BROOD)).toBe(true);
		// The spoken walk passed through Matka, but its answers do not validate.
		expect(marks.has(QUEEN)).toBe(false);
	});

	it('drops a mark whose step no longer validates', async () => {
		const marks = new Set<number>([COMB, QUEEN]);
		await markValidatedSteps(QUEEN + 1, marks, async (fields) => fields !== stepFields[QUEEN]);

		expect([...marks]).toEqual([COMB]);
	});

	it('never marks the step being moved to', async () => {
		const marks = new Set<number>();
		await markValidatedSteps(QUEEN, marks, async () => true);

		expect([...marks]).toEqual([COMB]);
	});
});
