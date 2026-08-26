import { describe, expect, it } from 'vitest';

import { runFieldScript, summarise, type FieldValues } from '../../../../lib/voice/fieldScript';
import { Aborted, type DialogueRuntime } from '../../../../lib/voice/useDialogueRuntime';
import { broodDefaults } from './brood.schema';
import { broodVoiceStep } from './brood.voice';

/**
 * Drives the brood script with a scripted list of utterances, exercising the
 * generic engine and the brood vocabulary together. No microphone, no React.
 */
function harness(script: string[]) {
	const spoken: string[] = [];
	const queue = [...script];
	let values: FieldValues = { ...broodDefaults };
	const status: Record<string, unknown> = {};
	let turns = 0;

	const runtime = {
		supported: true,
		running: true,
		log: [],
		error: null,
		setError: () => {},
		announce: async (text: string) => {
			spoken.push(text);
		},
		ask: async () => null,
		askWith: async <T>(match: (transcript: string) => T | null) => {
			turns += 1;
			if (turns > 100) throw new Error('script did not terminate');
			const next = queue.shift();
			if (next === undefined) throw new Aborted();
			return match(next);
		},
		noteMiss: () => null,
		guard: () => {},
		resetMisses: () => {},
		setStatus: (patch: Record<string, unknown>) => {
			Object.assign(status, patch);
		},
		run: async () => {},
		stop: () => {},
	} as unknown as DialogueRuntime;

	const api = {
		getValues: () => values,
		setValue: (name: string, value: unknown) => {
			values = { ...values, [name]: value };
		},
	};

	return { runtime, api, spoken, status, values: () => values };
}

const run = async (script: string[]) => {
	const h = harness(script);
	const outcome = await runFieldScript(h.runtime, broodVoiceStep, h.api);
	return { outcome, values: h.values(), spoken: h.spoken, status: h.status };
};

const ASK_TYPES = 'Rodzaj czerwiu? Jaja, otwarty, kryty, trutowy.';
const ASK_PATTERN = 'Zwartość czerwiu, od jeden do pięciu?';

describe('brood script — the ordinary case', () => {
	it('takes several types from one utterance and a rating', async () => {
		const { outcome, values } = await run(['jaja, larwy i kryty', 'cztery', 'dalej']);

		expect(outcome).toBe('done');
		expect(values).toMatchObject({ brood_types: ['eggs', 'open', 'capped'], brood_pattern: 4 });
	});

	it('takes a single type', async () => {
		const { values } = await run(['czerw kryty', 'trzy', 'dalej']);
		expect(values.brood_types).toEqual(['capped']);
	});

	// The set is read back in schema order however it was dictated, so the
	// summary reads the same way every time.
	it('reads the types back in a fixed order', async () => {
		const { values, status } = await run(['trutowy, kryty, jaja', 'pięć', 'dalej']);
		expect(values.brood_types).toEqual(['eggs', 'capped', 'drone']);
		expect(status.summary).toBe('jaja, kryty, trutowy, zwartość 5 na pięć');
	});
});

describe('brood script — vocabulary', () => {
	it('takes the inflections a beekeeper actually uses', async () => {
		const { values } = await run(['jajeczka i larwy', 'trzy', 'dalej']);
		expect(values.brood_types).toEqual(['eggs', 'open']);
	});

	it('hears "trutnie" as drone brood', async () => {
		const { values } = await run(['trutnie', 'trzy', 'dalej']);
		expect(values.brood_types).toEqual(['drone']);
	});

	// "niekryty" contains "kryty"; the capped stem must not claim it.
	it('does not read open brood as capped', async () => {
		const { values } = await run(['czerw niekryty', 'trzy', 'dalej']);
		expect(values.brood_types).toEqual(['open']);
	});

	it('takes them all at once', async () => {
		const { values } = await run(['wszystko', 'trzy', 'dalej']);
		expect(values.brood_types).toEqual(['eggs', 'open', 'capped', 'drone']);
	});
});

describe('brood script — a colony with no brood', () => {
	it('records an empty list and skips the rating question', async () => {
		const { outcome, values, spoken } = await run(['brak czerwiu', 'dalej']);

		expect(outcome).toBe('done');
		expect(values.brood_types).toEqual([]);
		expect(spoken).not.toContain(ASK_PATTERN);
	});

	// The schema demands 1..5 whatever the types say, so the step has to stay
	// saveable without asking how compact brood that is not there is.
	it('pins the rating to the lowest so the step still validates', async () => {
		const { values } = await run(['brak czerwiu', 'dalej']);
		expect(values.brood_pattern).toBe(1);
	});

	it('says so in the read-back', async () => {
		const { status } = await run(['nie ma', 'dalej']);
		expect(status.summary).toBe('brak czerwiu');
	});

	// "brak trutowego" names a type and denies it in the same breath. Recording
	// the type would be the opposite of what was said.
	it('re-asks rather than guessing when a type is denied', async () => {
		const { values, spoken } = await run(['brak trutowego', 'jaja i kryty', 'cztery', 'dalej']);

		expect(spoken).toContain(`Nie zrozumiałem. ${ASK_TYPES}`);
		expect(values.brood_types).toEqual(['eggs', 'capped']);
	});
});

describe('brood script — the rating', () => {
	it('takes a number as a word or a digit', async () => {
		expect((await run(['jaja', 'dwa', 'dalej'])).values.brood_pattern).toBe(2);
		expect((await run(['jaja', '5', 'dalej'])).values.brood_pattern).toBe(5);
	});

	it('takes the pattern described rather than counted', async () => {
		expect((await run(['jaja', 'zwarty', 'dalej'])).values.brood_pattern).toBe(5);
		expect((await run(['jaja', 'rozstrzelony', 'dalej'])).values.brood_pattern).toBe(2);
		expect((await run(['jaja', 'mozaikowaty', 'dalej'])).values.brood_pattern).toBe(2);
	});

	// The longer phrase wins, so the stronger claim is still reachable.
	it('separates "słaby" from "bardzo słaby"', async () => {
		expect((await run(['jaja', 'słaby', 'dalej'])).values.brood_pattern).toBe(2);
		expect((await run(['jaja', 'bardzo słaby', 'dalej'])).values.brood_pattern).toBe(1);
	});
});

describe('brood script — correcting at the read-back', () => {
	it('replaces the whole set when the types are named again', async () => {
		const { values } = await run(['jaja', 'cztery', 'kryty i trutowy', 'dalej']);
		expect(values.brood_types).toEqual(['capped', 'drone']);
	});

	it('amends the rating by naming a number', async () => {
		const { values } = await run(['jaja', 'cztery', 'dwa', 'dalej']);
		expect(values.brood_pattern).toBe(2);
	});

	// "nie" is a correction here, not an answer of "no brood" — control words
	// win once the step is being confirmed as a whole.
	it('treats "nie" at the read-back as a restart', async () => {
		const { spoken } = await run(['jaja', 'cztery', 'nie', 'kryty', 'trzy', 'dalej']);
		expect(spoken.filter((line) => line === ASK_TYPES)).toHaveLength(2);
	});
});

describe('brood script — navigation', () => {
	it('reports back so the caller can move to the previous step', async () => {
		const { outcome } = await run(['wstecz']);
		expect(outcome).toBe('back');
	});

	it('stops the whole dialogue on "stop"', async () => {
		await expect(run(['jaja', 'stop'])).rejects.toBeInstanceOf(Aborted);
	});
});

describe('summarise', () => {
	it('speaks the same words the screen shows', () => {
		expect(summarise(broodVoiceStep, { brood_types: ['eggs', 'capped'], brood_pattern: 4 })).toBe(
			'jaja, kryty, zwartość 4 na pięć',
		);
	});
});
