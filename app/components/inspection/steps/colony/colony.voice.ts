import { choicesFrom } from '../../../../lib/voice/choice';
import type { VoiceStep } from '../../../../lib/voice/fieldScript';
import { COLONY_BEHAVIOR_OPTIONS, COLONY_HIVE_SPACE_OPTIONS } from './colony.schema';

/**
 * Spoken script for the colony step, kept beside the schema so the vocabulary
 * and the validation cannot drift apart.
 *
 * Three independent fields, none gating another — no reconcile needed.
 */

const BEHAVIOR_CHOICES = choicesFrom(COLONY_BEHAVIOR_OPTIONS, {
	calm: ['lagodne', 'lagodna', 'spokojna'],
	nervous: ['nerwowa', 'zdenerwowane'],
	aggressive: ['agresywna', 'zle', 'kasliwe', 'zadla'],
	swarm_mood: ['rojowy', 'roj', 'roi sie'],
});

// "ok" is also how the beekeeper confirms the step as a whole, so naming this
// value at the read-back gets read as "move on" rather than an amendment —
// the same tradeoff already accepted for "dobrze"/"dobra" in comb wear. Asked
// on its own prompt it works fine: field vocabulary wins there.
const HIVE_SPACE_CHOICES = choicesFrom(COLONY_HIVE_SPACE_OPTIONS, {
	ok: ['wystarczajaca', 'wystarczy', 'dosc miejsca', 'ok'],
	tight: ['ciasna', 'malo miejsca', 'brak miejsca'],
	loose: ['luzna', 'duzo miejsca', 'sporo miejsca'],
	added_super: ['dodalem nadstawke', 'dolozylem nadstawke', 'z nadstawka'],
});

const label = (options: { value: string; label: string }[], value: unknown) =>
	options.find((option) => option.value === value)?.label.toLowerCase() ?? null;

export const colonyVoiceStep: VoiceStep = {
	key: 'colony',
	fields: [
		{
			kind: 'number',
			name: 'frames_covered',
			prompt: 'Ile ramek jest obsiadanych?',
			min: 0,
			max: 20,
			readBack: (value) => (typeof value === 'number' ? `${value} ramek obsiadanych` : null),
		},
		{
			kind: 'choice',
			name: 'behavior',
			prompt: 'Jakie jest zachowanie rodziny?',
			choices: BEHAVIOR_CHOICES,
			readBack: (value) => {
				const found = label(COLONY_BEHAVIOR_OPTIONS, value);
				return found ? `zachowanie ${found}` : null;
			},
		},
		{
			kind: 'choice',
			name: 'hive_space',
			prompt: 'Jak jest z miejscem w ulu?',
			choices: HIVE_SPACE_CHOICES,
			readBack: (value) => {
				const found = label(COLONY_HIVE_SPACE_OPTIONS, value);
				return found ? `przestrzeń ${found}` : null;
			},
		},
	],
};
