import { choicesFrom } from '../../../../lib/voice/choice';
import type { FieldValues, VoiceStep } from '../../../../lib/voice/fieldScript';
import { BROOD_TYPE, BROOD_TYPE_OPTIONS } from './brood.schema';

/**
 * Spoken script for the brood step, kept beside the schema so the vocabulary and
 * the validation cannot drift apart.
 *
 * Two questions, but the first is the form's only multi-select: "jaja, larwy i
 * kryty" is one breath and three values, so it uses the `multi` field kind
 * rather than asking about each type in turn.
 */

// "czerw" itself is deliberately unclaimed. It is the neutral head noun in
// "czerw kryty" and "czerw trutowy", so matching it would make every one of
// these answers ambiguous; unnamed tokens are simply ignored.
const TYPE_CHOICES = choicesFrom(BROOD_TYPE_OPTIONS, {
	eggs: ['jaja', 'jajk', 'jajeczk', 'jajo'],
	// "larwy" is what gets said in the field far more often than "otwarty".
	open: ['otwart', 'larw', 'niekryt', 'robacz'],
	capped: ['kryt', 'zakryt', 'sklepion'],
	drone: ['trutow', 'trutn', 'truten', 'garbat'],
});

/**
 * A broodless colony is a real answer, not a failure to understand, so it needs
 * wording of its own — an empty list cannot be spoken by naming options.
 */
const TYPE_PHRASES = {
	none: ['brak', 'nie ma', 'niema', 'zadnego', 'zadnych', 'czyst', 'pusto', 'bez czerwiu', 'nie'],
	all: ['wszystk', 'komplet'],
};

/**
 * How compactness is actually described out loud. Four is left without words on
 * purpose: "dobrze" and "dobra" are the natural ones for it, and they are also
 * how the beekeeper confirms — taking them here would strand every confirmation
 * spoken at this prompt.
 */
const PATTERN_WORDS: Record<number, string[]> = {
	1: ['fataln', 'najgorsz', 'bardzo slaby'],
	2: ['rozstrzel', 'mozaik', 'dziuraw', 'nierown', 'slab'],
	3: ['sredni', 'przecietn'],
	5: ['zwart', 'rowny', 'rowne', 'rowna', 'idealn'],
};

/** Short forms for the read-back; the UI label "Otwarty (larwy)" does not speak. */
const TYPE_SPEECH: Record<string, string> = {
	eggs: 'jaja',
	open: 'otwarty',
	capped: 'kryty',
	drone: 'trutowy',
};

const typesOf = (value: unknown): string[] | null =>
	Array.isArray(value) ? BROOD_TYPE.filter((type) => value.includes(type)) : null;

/**
 * `brood_pattern` is required 1..5 whatever the types say, so a colony with no
 * brood at all would leave the step unsaveable — and asking how compact absent
 * brood is, is a question with no answer. Pin it to the lowest instead and skip
 * the question; the screen shows the 1, so it can still be corrected by hand.
 *
 * Kept out of StepBrood on purpose: on screen the field starts empty and pinning
 * it there would stamp a rating on every inspection nobody has touched yet.
 */
export function reconcileBrood(values: FieldValues): FieldValues {
	const next = { ...values };
	if ((typesOf(next.brood_types) ?? []).length === 0) next.brood_pattern = 1;
	return next;
}

export const broodVoiceStep: VoiceStep = {
	key: 'brood',
	fields: [
		{
			kind: 'multi',
			name: 'brood_types',
			// The options are listed in the prompt: unlike a yes/no or a colour,
			// there is no guessing what the closed set is until it is said once.
			prompt: 'Rodzaj czerwiu? Jaja, otwarty, kryty, trutowy.',
			choices: TYPE_CHOICES,
			phrases: TYPE_PHRASES,
			readBack: (value) => {
				const types = typesOf(value);
				if (types === null) return null;
				if (types.length === 0) return 'brak czerwiu';
				return types.map((type) => TYPE_SPEECH[type]).join(', ');
			},
		},
		{
			kind: 'number',
			name: 'brood_pattern',
			prompt: 'Zwartość czerwiu, od jeden do pięciu?',
			min: 1,
			max: 5,
			synonyms: PATTERN_WORDS,
			when: (values) => (typesOf(values.brood_types) ?? []).length > 0,
			readBack: (value) => (typeof value === 'number' ? `zwartość ${value} na pięć` : null),
		},
	],

	reconcile: reconcileBrood,
};
