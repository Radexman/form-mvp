import { beforeEach, describe, expect, it } from 'vitest';

import { makeFrame, type FrameValues } from '../../components/inspection/steps/comb/comb.schema';
import { parseCommand } from './grammar';
import { runCombStep } from './runCombStep';
import { Aborted, MAX_MISS_STREAK, type DialogueRuntime } from './useDialogueRuntime';

/**
 * Drives the comb dialogue from a script of utterances. Now that comb runs on
 * the shared runtime this needs no React and no microphone — the earlier
 * version of these tests had to render a hook.
 */

const spoken: string[] = [];
let queue: string[] = [];
let missStreak = 0;
let turns = 0;
const status: Record<string, unknown> = {};

function makeRuntime(): DialogueRuntime {
	return {
		announce: async (text: string) => {
			spoken.push(text);
		},
		ask: async () => {
			turns += 1;
			if (turns > 200) throw new Error('dialogue did not terminate');
			const next = queue.shift();
			if (next === undefined) {
				// Out of script: behaves like silence that has outlasted its budget.
				missStreak += 1;
				if (missStreak >= MAX_MISS_STREAK) throw new Aborted();
				return null;
			}
			const command = parseCommand(next);
			if (command) missStreak = 0;
			else missStreak += 1;
			if (!command && missStreak >= MAX_MISS_STREAK) throw new Aborted();
			return command;
		},
		guard: () => {},
		noteMiss: () => {
			missStreak += 1;
			if (missStreak >= MAX_MISS_STREAK) throw new Aborted();
			return null;
		},
		resetMisses: () => {
			missStreak = 0;
		},
		setError: () => {},
		setStatus: (patch: Record<string, unknown>) => {
			Object.assign(status, patch);
		},
	} as unknown as DialogueRuntime;
}

async function run(script: string[], initialFrames: FrameValues[] = []) {
	queue = [...script];
	const state = { frames: initialFrames, slots: 0, active: 0 };
	const api = {
		getFrames: () => state.frames,
		setFrames: (frames: FrameValues[]) => {
			state.frames = frames;
		},
		setSlots: (slots: number) => {
			state.slots = slots;
		},
		setActive: (index: number) => {
			state.active = index;
		},
	};

	// "stop" unwinds by throwing, which the runtime swallows in the real app.
	try {
		return { outcome: await runCombStep(makeRuntime(), api), state };
	} catch (failure) {
		if (failure instanceof Aborted) return { outcome: 'aborted' as const, state };
		throw failure;
	}
}

const said = (fragment: string) => spoken.some((line) => line.includes(fragment));

beforeEach(() => {
	spoken.length = 0;
	queue = [];
	missStreak = 0;
	turns = 0;
	for (const key of Object.keys(status)) delete status[key];
});

describe('the happy path', () => {
	it('walks every frame and commits what was confirmed', async () => {
		const { outcome, state } = await run(['dwa', 'miód 8 pierzga 1', 'dalej', 'pusta', 'dalej']);

		expect(outcome).toBe('done');
		expect(state.slots).toBe(2);
		expect(state.frames).toHaveLength(2);
		expect(state.frames[0]).toMatchObject({ honey: 8, pollen: 1, brood: 0 });
		expect(state.frames[1]).toMatchObject({ honey: 0, pollen: 0, brood: 0 });
	});

	it('asks for slots first, then announces frames by ordinal', async () => {
		await run(['jeden', 'pusta', 'dalej']);
		expect(spoken[0]).toBe('Miejsca w gnieździe?');
		expect(said('Ramka pierwsza')).toBe(true);
	});

	it('publishes which frame it is on, so the screen can follow', async () => {
		await run(['dwa', 'pusta', 'dalej', 'pusta', 'dalej']);
		expect(status.summary).toBe('Ramka druga z 2');
	});
});

describe('confirmation is required', () => {
	it('accepts a spoken correction before committing', async () => {
		const { state } = await run(['jeden', 'czerw 8 miód 1', 'czerw 7', 'dalej']);
		expect(state.frames[0]).toMatchObject({ brood: 7, honey: 1 });
	});

	it('refuses an overflowing frame out loud instead of writing it', async () => {
		const { state } = await run(['jeden', 'czerw 8 miód 5', 'czerw 8 miód 1', 'dalej']);
		expect(said('więcej niż cała ramka')).toBe(true);
		expect(state.frames[0]).toMatchObject({ brood: 8, honey: 1 });
	});
});

describe('regressions', () => {
	it('accepts "dalej" at the frame prompt instead of looping silently', async () => {
		const { outcome, state } = await run(['jeden', 'dalej']);
		expect(outcome).toBe('done');
		expect(state.frames).toHaveLength(1);
	});

	it('takes a resource correction after a mis-heard "węza"', async () => {
		const { state } = await run(['jeden', 'węza', 'miód 8', 'dalej']);
		expect(state.frames[0]).toMatchObject({ comb_state: 'drawn', honey: 8 });
	});

	it('keeps frames the dialogue has not reached', async () => {
		const existing = [
			{ ...makeFrame(1), honey: 6 },
			{ ...makeFrame(2), brood: 4 },
		];
		const { state } = await run(['dwa', 'stop'], existing);
		expect(state.frames[1]).toMatchObject({ brood: 4 });
	});

	it('reaches the one-at-a-time fallback and can finish there', async () => {
		const { state } = await run([
			'jeden',
			'yyy aaa',
			'bbb ccc',
			'ddd eee', // three misses -> repair
			'osiem', // Czerw?
			'fff ggg', // Miód? — a further miss must not abort the repair
			'jeden', // Pierzga?
			'dalej',
		]);
		expect(said('Zapytam po kolei')).toBe(true);
		expect(state.frames[0]).toMatchObject({ brood: 8, honey: 0, pollen: 1 });
	});

	it('re-announces the frame on "powtórz" rather than reading back a blank one', async () => {
		await run(['jeden', 'powtórz', 'pusta', 'dalej']);
		expect(spoken.filter((line) => line === 'Ramka pierwsza').length).toBeGreaterThan(1);
	});
});

describe('silence', () => {
	// The runtime waits out quiet before ever reporting a miss, so the dialogue
	// must not recite the whole frame back each time it hears nothing.
	it('re-asks the short question rather than the whole read-back', async () => {
		await run(['jeden', 'miód 5', '', '', 'dalej']);
		const readBacks = spoken.filter((line) => line.startsWith('Ramka pierwsza:'));
		expect(readBacks).toHaveLength(1);
		expect(spoken.filter((line) => line === 'Przejść do kolejnej ramki?').length).toBeGreaterThan(0);
	});
});

describe('leaving the step', () => {
	it('reports "back" when backing out of the first frame', async () => {
		const { outcome } = await run(['jeden', 'wstecz']);
		expect(outcome).toBe('back');
	});

	it('stops the whole dialogue on "stop"', async () => {
		const { outcome } = await run(['jeden', 'stop']);
		expect(outcome).toBe('aborted');
	});
});
