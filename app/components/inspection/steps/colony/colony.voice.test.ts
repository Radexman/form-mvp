import { describe, expect, it } from 'vitest';

import { runFieldScript, summarise, type FieldValues } from '../../../../lib/voice/fieldScript';
import { Aborted, type DialogueRuntime } from '../../../../lib/voice/useDialogueRuntime';
import { colonyDefaults } from './colony.schema';
import { colonyVoiceStep } from './colony.voice';

/**
 * Drives the colony script with a scripted list of utterances, exercising the
 * generic engine and the colony vocabulary together. No microphone, no React.
 */
function harness(script: string[]) {
	const spoken: string[] = [];
	const queue = [...script];
	let values: FieldValues = { ...colonyDefaults };
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
	const outcome = await runFieldScript(h.runtime, colonyVoiceStep, h.api);
	return { outcome, values: h.values(), spoken: h.spoken, status: h.status };
};

describe('colony script — the ordinary case', () => {
	it('takes a frame count, a behavior and a space reading', async () => {
		const { outcome, values } = await run(['dwanaście', 'spokojne', 'wystarczająca', 'dalej']);

		expect(outcome).toBe('done');
		expect(values).toMatchObject({ frames_covered: 12, behavior: 'calm', hive_space: 'ok' });
	});

	it('reads the answers back in the fixed field order', async () => {
		const { status } = await run(['osiem', 'nerwowe', 'ciasno', 'dalej']);
		expect(status.summary).toBe('8 ramek obsiadanych, zachowanie nerwowe, przestrzeń ciasno');
	});
});

describe('colony script — vocabulary', () => {
	it('takes field wording that differs from the UI label', async () => {
		expect((await run(['pięć', 'łagodna', 'ok', 'dalej'])).values.behavior).toBe('calm');
		expect((await run(['pięć', 'złe', 'ok', 'dalej'])).values.behavior).toBe('aggressive');
		expect((await run(['pięć', 'rój', 'ok', 'dalej'])).values.behavior).toBe('swarm_mood');
	});

	it('hears the added-super phrasing for hive space', async () => {
		const { values } = await run(['pięć', 'spokojne', 'dołożyłem nadstawkę', 'dalej']);
		expect(values.hive_space).toBe('added_super');
	});

	it('takes "ok" as a value while its own question is being asked', async () => {
		const { values } = await run(['pięć', 'spokojne', 'ok', 'dalej']);
		expect(values.hive_space).toBe('ok');
	});
});

describe('colony script — correcting at the read-back', () => {
	it('amends the behavior by naming it again', async () => {
		const { values } = await run(['pięć', 'spokojne', 'ciasno', 'agresywne', 'dalej']);
		expect(values.behavior).toBe('aggressive');
	});

	// "ok" said here answers "Czy przejść dalej?" instead of amending hive_space —
	// control words win once the step is being confirmed as a whole, the same
	// tradeoff already accepted for "dobrze"/"dobra" in comb wear.
	it('reads "ok" at the read-back as confirmation, not an amendment', async () => {
		const { outcome, values } = await run(['pięć', 'spokojne', 'ciasno', 'ok']);
		expect(outcome).toBe('done');
		expect(values.hive_space).toBe('tight');
	});
});

describe('colony script — navigation', () => {
	it('reports back so the caller can move to the previous step', async () => {
		const { outcome } = await run(['wstecz']);
		expect(outcome).toBe('back');
	});

	it('stops the whole dialogue on "stop"', async () => {
		await expect(run(['pięć', 'stop'])).rejects.toBeInstanceOf(Aborted);
	});
});

describe('summarise', () => {
	it('speaks the same words the screen shows', () => {
		expect(summarise(colonyVoiceStep, { frames_covered: 10, behavior: 'calm', hive_space: 'ok' })).toBe(
			'10 ramek obsiadanych, zachowanie spokojne, przestrzeń wystarczająca',
		);
	});
});
