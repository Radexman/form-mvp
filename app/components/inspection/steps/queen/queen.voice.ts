import { choicesFrom } from '../../../../lib/voice/choice';
import type { FieldValues, VoiceStep } from '../../../../lib/voice/fieldScript';
import { QUEEN_CELLS_OPTIONS, QUEEN_MARKER_COLOR_OPTIONS, QUEEN_STATUS_OPTIONS } from './queen.schema';

/**
 * Spoken script for the queen step, kept beside the schema so the vocabulary
 * and the validation cannot drift apart.
 *
 * Each option's Polish label is spoken vocabulary for free; only the wording a
 * beekeeper actually uses in the field — which is rarely the UI label — needs
 * writing out here.
 */

const STATUS_CHOICES = choicesFrom(QUEEN_STATUS_OPTIONS, {
	seen: ['widziana', 'widzialem', 'widzialam', 'jest', 'obecna', 'znalazlem'],
	not_seen_brood_ok: ['nie widziana', 'niewidziana', 'czerw ok', 'czerw jest', 'nie widzialem', 'po czerwiu'],
	missing: ['brak', 'nie ma', 'bezmateczna', 'zadnej'],
});

const COLOR_CHOICES = choicesFrom(QUEEN_MARKER_COLOR_OPTIONS, {
	white: ['biala', 'bialy'],
	yellow: ['zolta', 'zolty'],
	red: ['czerwona', 'czerwony'],
	green: ['zielona', 'zielony'],
	blue: ['niebieska', 'niebieski'],
});

const CELLS_CHOICES = choicesFrom(QUEEN_CELLS_OPTIONS, {
	none: ['brak', 'nie ma', 'zadnych', 'czysto'],
	emergency: ['ratunkowe', 'ratunkowy'],
	swarm: ['rojowe', 'rojowy', 'rojka'],
	supersedure: ['cicha wymiana', 'cicha', 'wymiana'],
});

const label = (options: { value: string; label: string }[], value: unknown) =>
	options.find((option) => option.value === value)?.label.toLowerCase() ?? null;

/** Fields the queen step owns, for reconciling the whole group at once. */
export const QUEEN_FIELDS = [
	'queen_status',
	'queen_marked',
	'queen_marker_color',
	'queen_cells',
	'queen_cells_count',
] as const;

/**
 * queenSchema's cross-field refinements, expressed once. Both the spoken script
 * and the on-screen controls run this, so typing and talking can never leave the
 * step in a shape the schema rejects.
 */
export function reconcileQueen(values: FieldValues): FieldValues {
	const next = { ...values };
	if (next.queen_status === 'missing') {
		next.queen_marked = false;
		next.queen_marker_color = null;
	}
	if (next.queen_marked !== true) next.queen_marker_color = null;
	if (next.queen_cells === 'none' || next.queen_cells === undefined) next.queen_cells_count = 0;
	else if (typeof next.queen_cells_count !== 'number' || next.queen_cells_count < 1) next.queen_cells_count = 1;
	return next;
}

export const queenVoiceStep: VoiceStep = {
	key: 'queen',
	fields: [
		{
			kind: 'choice',
			name: 'queen_status',
			prompt: 'Matka?',
			choices: STATUS_CHOICES,
			readBack: (value) => {
				const found = label(QUEEN_STATUS_OPTIONS, value);
				return found ? `matka ${found}` : null;
			},
		},
		{
			kind: 'boolean',
			name: 'queen_marked',
			prompt: 'Znakowana?',
			yes: ['znakowana', 'znaczona', 'ma znaczek', 'kropka'],
			no: ['nieznakowana', 'niezanaczona', 'bez znaczka'],
			// A missing queen cannot be marked — mirrors the schema refinement.
			when: (values) => values.queen_status !== 'missing',
			readBack: (value) => (value ? 'znakowana' : 'nieznakowana'),
		},
		{
			kind: 'choice',
			name: 'queen_marker_color',
			prompt: 'Kolor znaczka?',
			choices: COLOR_CHOICES,
			when: (values) => values.queen_status !== 'missing' && values.queen_marked === true,
			readBack: (value) => {
				const found = label(QUEEN_MARKER_COLOR_OPTIONS, value);
				return found ? `znaczek ${found}` : null;
			},
		},
		{
			kind: 'choice',
			name: 'queen_cells',
			prompt: 'Mateczniki?',
			choices: CELLS_CHOICES,
			readBack: (value) => {
				const found = label(QUEEN_CELLS_OPTIONS, value);
				return found ? `mateczniki ${found}` : null;
			},
		},
		{
			kind: 'number',
			name: 'queen_cells_count',
			prompt: 'Ile mateczników?',
			min: 1,
			max: 50,
			when: (values) => values.queen_cells !== 'none' && values.queen_cells !== undefined,
			readBack: (value) => (typeof value === 'number' && value > 0 ? `${value} sztuk` : null),
		},
	],

	reconcile: reconcileQueen,
};
