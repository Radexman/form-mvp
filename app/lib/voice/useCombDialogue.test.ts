// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeFrame, type FrameValues } from '../../components/inspection/steps/comb/comb.schema';

/**
 * Drives the whole dialogue with speech I/O replaced by a script of utterances,
 * so the control flow — retries, corrections, navigation, give-up — is testable
 * without a microphone. This is where the loop bugs live.
 */

class FakeListenError extends Error {
	constructor(readonly reason: string) {
		super(reason);
	}
}

const spoken: string[] = [];
let queue: string[] = [];
let listenCalls = 0;

vi.mock('./useSpeechIO', () => ({
	ListenError: FakeListenError,
	isSpeechSupported: () => true,
	useSpeechIO: () => ({
		supported: true,
		speak: async (text: string) => {
			spoken.push(text);
		},
		listen: async () => {
			listenCalls += 1;
			// Guard against a runaway loop hanging the suite.
			if (listenCalls > 200) throw new Error('dialogue did not terminate');
			const next = queue.shift();
			if (next === undefined) throw new FakeListenError('no-speech');
			return [next];
		},
		primeMicrophone: async () => {},
		cancel: () => {},
	}),
}));

const { useCombDialogue } = await import('./useCombDialogue');

function harness(initialFrames: FrameValues[] = []) {
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
	return { state, api };
}

async function run(script: string[], initialFrames: FrameValues[] = []) {
	queue = [...script];
	const { state, api } = harness(initialFrames);
	const { result } = renderHook(() => useCombDialogue(api));
	await act(async () => {
		await result.current.start();
	});
	return { state, result };
}

const said = (fragment: string) => spoken.some((line) => line.includes(fragment));

beforeEach(() => {
	spoken.length = 0;
	queue = [];
	listenCalls = 0;
});

describe('the happy path', () => {
	it('walks every frame and commits what was confirmed', async () => {
		const { state, result } = await run(['dwa', 'miód 8 pierzga 1', 'dalej', 'pusta', 'dalej']);

		expect(state.slots).toBe(2);
		expect(state.frames).toHaveLength(2);
		expect(state.frames[0]).toMatchObject({ honey: 8, pollen: 1, brood: 0 });
		expect(state.frames[1]).toMatchObject({ honey: 0, pollen: 0, brood: 0 });
		expect(result.current.phase).toBe('done');
		expect(said('Gotowe')).toBe(true);
	});

	it('asks for slots first, then announces frames by ordinal', async () => {
		await run(['jeden', 'pusta', 'dalej']);
		expect(spoken[0]).toBe('Miejsca w gnieździe?');
		expect(said('Ramka pierwsza')).toBe(true);
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

describe('finding 1 — "dalej" at the frame prompt', () => {
	it('accepts the frame as announced instead of looping silently', async () => {
		const { state, result } = await run(['jeden', 'dalej']);
		expect(state.frames).toHaveLength(1);
		expect(result.current.phase).toBe('done');
	});
});

describe('finding 2 — correcting a mis-heard "węza"', () => {
	it('takes a resource correction at the confirm prompt', async () => {
		const { state } = await run(['jeden', 'węza', 'miód 8', 'dalej']);
		expect(state.frames[0]).toMatchObject({ comb_state: 'drawn', honey: 8 });
	});
});

describe('finding 4 — restarting must not wipe existing frames', () => {
	it('keeps frames the dialogue has not reached', async () => {
		const existing = [
			{ ...makeFrame(1), honey: 6 },
			{ ...makeFrame(2), brood: 4 },
		];
		const { state } = await run(['dwa', 'stop'], existing);
		expect(state.frames[1]).toMatchObject({ brood: 4 });
	});
});

describe('finding 7 — the one-question-at-a-time fallback', () => {
	it('is reachable and can complete after repeated misrecognition', async () => {
		const { state } = await run([
			'jeden',
			'yyy aaa',
			'bbb ccc',
			'ddd eee', // three misses -> repair
			'osiem', // Czerw?
			'fff ggg', // Miód? — a fourth miss must not abort the repair itself
			'jeden', // Pierzga?
			'dalej',
		]);
		expect(said('Zapytam po kolei')).toBe(true);
		expect(state.frames[0]).toMatchObject({ brood: 8, honey: 0, pollen: 1 });
	});
});

describe('finding 9 — "powtórz" at the frame prompt', () => {
	it('re-announces the frame rather than reading back a blank one', async () => {
		await run(['jeden', 'powtórz', 'pusta', 'dalej']);
		const announcements = spoken.filter((line) => line === 'Ramka pierwsza');
		expect(announcements.length).toBeGreaterThan(1);
		// It must not have read back an empty frame in response to "powtórz".
		expect(spoken.indexOf('Ramka pierwsza: puste 100 procent, plaster dobry. Dalej?')).toBeGreaterThan(
			spoken.lastIndexOf('Ramka pierwsza'),
		);
	});
});

describe('giving up', () => {
	it('stops after a run of unintelligible turns rather than asking forever', async () => {
		const { result } = await run(['jeden', 'yyy', 'yyy', 'yyy', 'yyy', 'yyy', 'yyy', 'yyy', 'yyy', 'yyy']);
		expect(result.current.error).toBeTruthy();
		expect(result.current.phase).toBe('idle');
	});
});

describe('navigation', () => {
	it('goes back to an earlier frame and re-runs it', async () => {
		const { state } = await run(['dwa', 'miód 5', 'dalej', 'wstecz', 'miód 9', 'dalej', 'pusta', 'dalej']);
		expect(state.frames[0]).toMatchObject({ honey: 9 });
	});
});
