import type { FieldErrors, FieldPath } from 'react-hook-form';

import { STEP_META, stepFields, type FormValues } from './schema';

type FieldName = FieldPath<FormValues>;

/**
 * Which step owns a field, or -1 for a name no step owns (a root-level issue).
 * Nested paths — `frames.0.brood` — belong to the step that owns their root.
 */
export function stepOfField(name: string): number {
	const root = name.split('.')[0];
	return stepFields.findIndex((fields) => fields.some((field) => field === root));
}

/** The steps a resolver's errors fall on, in stepper order. */
export function stepsWithErrors(errors: FieldErrors<FormValues>): number[] {
	const hit = new Set<number>();
	for (const name of Object.keys(errors)) {
		const index = stepOfField(name);
		if (index >= 0) hit.add(index);
	}
	return [...hit].sort((first, second) => first - second);
}

/** "Matka", "Matka i Czerw", "Matka, Czerw i Rodzina". */
function joinPl(items: string[]): string {
	if (items.length < 2) return items[0] ?? '';
	return `${items.slice(0, -1).join(', ')} i ${items[items.length - 1]}`;
}

/**
 * The message shown when the form will not move on. Field-level messages live
 * inside step panels, and the stepper renders every panel but the current one
 * with `hidden` — so on the summary they are in the document at 0x0 and the
 * beekeeper sees nothing. This names the sections instead.
 */
export function describeInvalidSteps(indexes: number[]): string {
	const titles = indexes.flatMap((index) => STEP_META[index]?.title ?? []);
	if (titles.length === 0) return 'Formularz zawiera błędy. Sprawdź sekcje i popraw zaznaczone pola.';
	return `Popraw błędy w ${titles.length === 1 ? 'sekcji' : 'sekcjach'}: ${joinPl(titles)}.`;
}

/**
 * Marks the steps below `upto` that the schema actually accepts, and unmarks
 * the rest. The spoken walk passes through steps without a Dalej press, and a
 * step marked without being validated unlocks the summary for data the full
 * schema rejects — which is where submit dies with nothing on screen.
 */
export async function markValidatedSteps(
	upto: number,
	marks: Set<number>,
	validate: (fields: FieldName[]) => Promise<boolean>,
): Promise<void> {
	for (let index = 0; index < Math.min(upto, stepFields.length); index += 1) {
		if (await validate(stepFields[index])) marks.add(index);
		else marks.delete(index);
	}
}
