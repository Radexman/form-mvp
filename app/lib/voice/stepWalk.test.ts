import { describe, expect, it } from 'vitest';

import { queenVoiceStep } from '../../components/inspection/steps/queen/queen.voice';
import { runFieldScript, type FieldScriptApi, type FieldValues, type VoiceStep } from './fieldScript';
import { parseControl } from './grammar';
import { Aborted, type DialogueRuntime } from './useDialogueRuntime';

/**
 * The hand-off between steps, exercised without React. This mirrors the walk in
 * useInspectionDialogue: run a step, offer the hand-off, act on the answer.
 */

const STEPS = [
	{ key: 'comb', title: 'Plastry i zasoby' },
	{ key: 'queen', title: 'Matka' },
	{ key: 'brood', title: 'Czerw' },
];

const SCRIPTS: Partial<Record<string, VoiceStep>> = { queen: queenVoiceStep };

function harness(script: string[]) {
	const spoken: string[] = [];
	const queue = [...script];
	let values: FieldValues = {};
	let turns = 0;

	const runtime = {
		announce: async (text: string) => {
			spoken.push(text);
		},
		askWith: async <T>(match: (transcript: string) => T | null) => {
			turns += 1;
			if (turns > 100) throw new Error('walk did not terminate');
			const next = queue.shift();
			if (next === undefined) throw new Aborted();
			return match(next);
		},
		guard: () => {},
		resetMisses: () => {},
		setStatus: () => {},
	} as unknown as DialogueRuntime;

	const api: FieldScriptApi = {
		getValues: () => values,
		setValue: (name, value) => {
			values = { ...values, [name]: value };
		},
	};

	return { runtime, api, spoken, values: () => values };
}

/** A trimmed copy of the walk in useInspectionDialogue. */
async function walk(script: string[], from = 1) {
	const h = harness(script);
	const visited: number[] = [from];
	let index = from;

	for (;;) {
		const step = STEPS[index];
		const voiceStep = SCRIPTS[step.key];
		if (!voiceStep) {
			await h.runtime.announce(`Sekcja ${step.title} nie jest jeszcze obsługiwana głosem.`);
			break;
		}

		const outcome = await runFieldScript(h.runtime, voiceStep, h.api);
		if (outcome === 'back') {
			if (index === 0) {
				await h.runtime.announce('To pierwsza sekcja.');
				continue;
			}
			index -= 1;
			visited.push(index);
			continue;
		}

		if (index === STEPS.length - 1) {
			await h.runtime.announce('Zapisane. To była ostatnia sekcja.');
			break;
		}

		await h.runtime.announce('Zapisane. Przejść do kolejnej sekcji?');
		const answer = await h.runtime.askWith(parseControl);
		if (answer?.kind === 'stop') break;
		if (answer?.kind === 'next') {
			index += 1;
			visited.push(index);
			continue;
		}
		if (answer?.kind === 'back') {
			index = Math.max(0, index - 1);
			visited.push(index);
			continue;
		}
		await h.runtime.announce('Zostaję w tej sekcji.');
		break;
	}

	return { visited, spoken: h.spoken, values: h.values() };
}

const QUEEN_ANSWERS = ['widziana', 'nie', 'brak', 'dalej'];

describe('the hand-off between steps', () => {
	it('offers to move on once a step is confirmed', async () => {
		const { spoken } = await walk([...QUEEN_ANSWERS, 'stop']);
		expect(spoken).toContain('Zapisane. Przejść do kolejnej sekcji?');
	});

	it.each([
		['tak'],
		['dalej'],
		['przejdź dalej'],
		['przejdź do kolejnej sekcji'],
		['kolejna sekcja'],
		['kolejna'],
		['następna'],
	])('advances on "%s"', async (word) => {
		const { visited } = await walk([...QUEEN_ANSWERS, word]);
		// queen -> brood, which has no script yet and ends the walk.
		expect(visited).toEqual([1, 2]);
	});

	it('stays put when the answer is not a clear yes', async () => {
		const { visited, spoken } = await walk([...QUEEN_ANSWERS, 'nie']);
		expect(visited).toEqual([1]);
		expect(spoken).toContain('Zostaję w tej sekcji.');
	});

	it('ends the walk on "stop" without advancing', async () => {
		const { visited } = await walk([...QUEEN_ANSWERS, 'stop']);
		expect(visited).toEqual([1]);
	});
});

describe('reaching a step without a script', () => {
	it('says so and stops rather than failing silently', async () => {
		const { spoken } = await walk([...QUEEN_ANSWERS, 'tak']);
		expect(spoken).toContain('Sekcja Czerw nie jest jeszcze obsługiwana głosem.');
	});
});

describe('going back', () => {
	it('moves to the previous step when a script reports "back"', async () => {
		// "wstecz" at the first question of queen leaves for comb.
		const { visited, spoken } = await walk(['wstecz']);
		expect(visited).toEqual([1, 0]);
		expect(spoken).toContain('Sekcja Plastry i zasoby nie jest jeszcze obsługiwana głosem.');
	});
});
