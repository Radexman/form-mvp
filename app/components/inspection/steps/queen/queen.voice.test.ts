import { describe, expect, it } from 'vitest';

import { runFieldScript, summarise, type FieldValues } from '../../../../lib/voice/fieldScript';
import { Aborted, type DialogueRuntime } from '../../../../lib/voice/useDialogueRuntime';
import { queenDefaults } from './queen.schema';
import { queenVoiceStep } from './queen.voice';

/**
 * Drives the queen script with a scripted list of utterances, exercising the
 * generic engine and the queen vocabulary together. No microphone, no React.
 */
function harness(script: string[]) {
	const spoken: string[] = [];
	const queue = [...script];
	let values: FieldValues = { ...queenDefaults };
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
		run: async () => {},
		stop: () => {},
	} as unknown as DialogueRuntime;

	const api = {
		getValues: () => values,
		setValue: (name: string, value: unknown) => {
			values = { ...values, [name]: value };
		},
	};

	return { runtime, api, spoken, values: () => values };
}

const run = async (script: string[]) => {
	const h = harness(script);
	const outcome = await runFieldScript(h.runtime, queenVoiceStep, h.api);
	return { outcome, values: h.values(), spoken: h.spoken };
};

describe('queen script — the ordinary case', () => {
	it('takes a marked queen with a colour and no cells', async () => {
		const { outcome, values } = await run(['widziana', 'tak', 'niebieski', 'brak', 'dalej']);

		expect(outcome).toBe('done');
		expect(values).toMatchObject({
			queen_status: 'seen',
			queen_marked: true,
			queen_marker_color: 'blue',
			queen_cells: 'none',
			queen_cells_count: 0,
		});
	});

	it('asks the fields in order, opening with the step name', async () => {
		const { spoken } = await run(['widziana', 'nie', 'brak', 'dalej']);
		expect(spoken[0]).toBe('Matka.');
		expect(spoken[1]).toBe('Matka?');
		expect(spoken[2]).toBe('Znakowana?');
		// Colour is skipped for an unmarked queen.
		expect(spoken).not.toContain('Kolor znaczka?');
		expect(spoken[3]).toBe('Mateczniki?');
	});
});

describe('queen script — conditional fields', () => {
	it('skips marking entirely when the queen is missing', async () => {
		const { values, spoken } = await run(['brak matki', 'rojowe', 'trzy', 'dalej']);

		expect(spoken).not.toContain('Znakowana?');
		expect(values).toMatchObject({
			queen_status: 'missing',
			queen_marked: false,
			queen_marker_color: null,
			queen_cells: 'swarm',
			queen_cells_count: 3,
		});
	});

	it('asks how many only when there are cells', async () => {
		const { spoken } = await run(['widziana', 'nie', 'brak', 'dalej']);
		expect(spoken).not.toContain('Ile mateczników?');
	});
});

describe('queen script — reconciliation mirrors the schema refinements', () => {
	it('clears the colour when the queen turns out to be unmarked', async () => {
		const { values } = await run(['widziana', 'tak', 'czerwony', 'brak', 'nieznakowana', 'dalej']);
		expect(values.queen_marked).toBe(false);
		expect(values.queen_marker_color).toBeNull();
	});

	it('never leaves cells present with a count of zero', async () => {
		const { values } = await run(['widziana', 'nie', 'ratunkowe', 'dwa', 'dalej']);
		expect(values.queen_cells).toBe('emergency');
		expect(values.queen_cells_count).toBe(2);
	});
});

describe('queen script — correcting at the read-back', () => {
	it('amends a mis-heard colour by naming the right one', async () => {
		const { values } = await run(['widziana', 'tak', 'czerwony', 'brak', 'niebieski', 'dalej']);
		expect(values.queen_marker_color).toBe('blue');
	});

	it('amends the status', async () => {
		const { values } = await run(['widziana', 'nie', 'brak', 'niewidziana', 'dalej']);
		expect(values.queen_status).toBe('not_seen_brood_ok');
	});
});

describe('queen script — navigation', () => {
	it('reports back so the caller can move to the previous step', async () => {
		const { outcome } = await run(['wstecz']);
		expect(outcome).toBe('back');
	});

	it('stops the whole dialogue on "stop"', async () => {
		await expect(run(['widziana', 'stop'])).rejects.toBeInstanceOf(Aborted);
	});
});

describe('summarise', () => {
	it('reads back only the fields that apply', () => {
		const summary = summarise(queenVoiceStep, {
			queen_status: 'seen',
			queen_marked: false,
			queen_marker_color: null,
			queen_cells: 'none',
			queen_cells_count: 0,
		});
		expect(summary).toBe('matka widziana, nieznakowana, mateczniki brak');
	});
});
