'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
	FRAME_TENTHS,
	MAX_SLOTS,
	makeFrame,
	type FrameValues,
} from '../../components/inspection/steps/comb/comb.schema';
import { applyFrameCommand } from './applyFrameCommand';
import { parseCommand, type Command } from './grammar';
import * as say from './phrases';
import { ListenError, useSpeechIO } from './useSpeechIO';

/**
 * The spoken frame-entry dialogue.
 *
 * Ask how many slots, then walk the frames one at a time: announce the frame,
 * take one utterance describing it, read it back, wait for "dalej". Nothing is
 * committed until that confirmation, so a mishear cannot land in the report
 * unnoticed.
 *
 * Voice is an input source for the existing form state, never a parallel path to
 * it — every value goes through the same clamp the +/- buttons use.
 */

const MAX_RETRIES = 2;
/**
 * Consecutive turns we can fail to understand before giving up entirely. Without
 * this the dialogue would keep asking forever while the phone sits in a pocket
 * and both hands are in the hive.
 */
const MAX_MISS_STREAK = 4;

export type DialoguePhase = 'idle' | 'slots' | 'frame' | 'confirm' | 'repair' | 'done';

export interface DialogueTurn {
	role: 'app' | 'you';
	text: string;
}

/** Thrown to unwind the async loop when the dialogue is stopped. */
class Aborted extends Error {}

type ConfirmOutcome = { kind: 'commit' } | { kind: 'jump'; position: number } | { kind: 'redo'; draft: FrameValues };

export interface CombDialogueApi {
	/** Read fresh each turn — the loop outlives any single render. */
	getFrames: () => FrameValues[];
	setFrames: (frames: FrameValues[]) => void;
	setSlots: (slots: number) => void;
	setActive: (index: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useCombDialogue(api: CombDialogueApi) {
	const io = useSpeechIO();
	const [phase, setPhase] = useState<DialoguePhase>('idle');
	const [running, setRunning] = useState(false);
	const [log, setLog] = useState<DialogueTurn[]>([]);
	const [error, setError] = useState<string | null>(null);

	const runningRef = useRef(false);
	const missStreakRef = useRef(0);
	/** The in-flight dialogue, so a restart can wait for it to unwind. */
	const loopRef = useRef<Promise<void> | null>(null);
	// Callbacks reached through a ref so the long-lived loop never goes stale.
	const apiRef = useRef(api);
	apiRef.current = api;

	const push = useCallback((role: DialogueTurn['role'], text: string) => {
		setLog((entries) => [...entries, { role, text }].slice(-8));
	}, []);

	const guard = useCallback(() => {
		if (!runningRef.current) throw new Aborted();
	}, []);

	const announce = useCallback(
		async (text: string) => {
			guard();
			push('app', text);
			await io.speak(text);
			guard();
		},
		[guard, io, push],
	);

	/** Count a turn we could not act on, and give up once they pile up. */
	const noteMiss = useCallback((): null => {
		missStreakRef.current += 1;
		if (missStreakRef.current >= MAX_MISS_STREAK) {
			setError('Nie słyszę odpowiedzi — dyktowanie zatrzymane. Możesz wpisać ramki ręcznie.');
			throw new Aborted();
		}
		return null;
	}, []);

	/**
	 * One turn: take the first alternative the grammar accepts, else null.
	 * Tracks consecutive failures across every prompt and ends the dialogue once
	 * it is clearly talking to nobody.
	 */
	const ask = useCallback(async (): Promise<Command | null> => {
		guard();

		let alternatives: string[];
		try {
			alternatives = await io.listen();
		} catch (failure) {
			guard();
			if (failure instanceof ListenError && failure.reason === 'not-allowed') {
				setError('Brak dostępu do mikrofonu. Zezwól na mikrofon albo wpisz ramki ręcznie.');
				throw new Aborted();
			}
			return noteMiss();
		}
		guard();

		for (const transcript of alternatives) {
			const command = parseCommand(transcript);
			if (command) {
				missStreakRef.current = 0;
				push('you', transcript);
				return command;
			}
		}
		if (alternatives[0]) push('you', alternatives[0]);
		return noteMiss();
	}, [guard, io, noteMiss, push]);

	const writeDraft = useCallback((index: number, draft: FrameValues) => {
		apiRef.current.setFrames(apiRef.current.getFrames().map((frame, i) => (i === index ? draft : frame)));
	}, []);

	/** Merge a command onto a draft, saying out loud why anything was refused. */
	const applyCommand = useCallback(
		async (draft: FrameValues, command: Command): Promise<FrameValues | null> => {
			if (command.kind !== 'frame') return draft;
			const result = applyFrameCommand(draft, command);
			if (result.ok) return result.frame;
			await announce(say.overflowWarning(result.total));
			return null;
		},
		[announce],
	);

	const askSlots = useCallback(async (): Promise<number> => {
		setPhase('slots');
		await announce(say.ASK_SLOTS);

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			const command = await ask();
			if (command?.kind === 'stop') throw new Aborted();
			if (command?.kind === 'number' && command.value >= 1 && command.value <= MAX_SLOTS) return command.value;
			if (attempt < MAX_RETRIES) await announce(say.askSlotsAgain(MAX_SLOTS));
		}
		setError('Nie udało się ustalić liczby miejsc. Ustaw ją ręcznie.');
		throw new Aborted();
	}, [announce, ask]);

	/** Fallback when a whole-frame utterance will not parse: one resource at a time. */
	const repairFrame = useCallback(
		async (draft: FrameValues): Promise<FrameValues> => {
			setPhase('repair');
			// Reaching repair already cost MAX_RETRIES misses; without clearing the
			// streak a single unclear answer here would abort the whole dialogue.
			missStreakRef.current = 0;
			await announce(say.REPAIR_INTRO);

			const questions = [
				{ key: 'brood', prompt: say.ASK_BROOD },
				{ key: 'honey', prompt: say.ASK_HONEY },
				{ key: 'pollen', prompt: say.ASK_POLLEN },
			] as const;

			let next: FrameValues = {
				...draft,
				comb_state: 'drawn',
				brood: 0,
				honey: 0,
				pollen: 0,
			};
			for (const { key, prompt } of questions) {
				await announce(prompt);
				const command = await ask();
				if (command?.kind === 'stop') throw new Aborted();

				let value = 0;
				if (command?.kind === 'number') value = command.value;
				else if (command?.kind === 'frame' && command.values[key] !== undefined) value = command.values[key];

				const remaining = FRAME_TENTHS - (next.brood + next.honey + next.pollen);
				next = { ...next, [key]: clamp(value, 0, Math.max(remaining, 0)) };
			}
			return next;
		},
		[announce, ask],
	);

	/** Read back, then wait for an explicit decision. Never commits on its own. */
	const confirmFrame = useCallback(
		async (initial: FrameValues, position: number, index: number, slots: number): Promise<ConfirmOutcome> => {
			let draft = initial;
			setPhase('confirm');

			for (;;) {
				guard();
				writeDraft(index, draft);
				await announce(say.readBack(draft, position));

				const answer = await ask();
				if (!answer) {
					await announce(say.NOT_HEARD);
					continue;
				}
				switch (answer.kind) {
					case 'stop':
						throw new Aborted();
					case 'next':
						return { kind: 'commit' };
					case 'undo':
						return { kind: 'redo', draft: makeFrame(position) };
					case 'back':
						return { kind: 'jump', position: Math.max(1, position - 1) };
					case 'goto':
						return { kind: 'jump', position: clamp(answer.position, 1, slots) };
					case 'frame': {
						const applied = await applyCommand(draft, answer);
						if (applied) draft = applied;
						continue;
					}
					default:
						continue;
				}
			}
		},
		[announce, applyCommand, ask, guard, writeDraft],
	);

	/** Runs one frame and returns the position to visit next. */
	const runFrame = useCallback(
		async (position: number, slots: number): Promise<number> => {
			const index = position - 1;
			apiRef.current.setActive(index);

			// What the frame held before this visit. The draft is written through as
			// it is dictated so the screen mirrors the conversation, so leaving
			// without confirming has to put the previous values back.
			const snapshot = apiRef.current.getFrames()[index] ?? makeFrame(position);
			let committed = false;

			try {
				let draft = makeFrame(position);
				let misses = 0;

				setPhase('frame');
				await announce(say.announceFrame(position));

				for (;;) {
					guard();
					const command = await ask();

					if (!command) {
						misses += 1;
						if (misses <= MAX_RETRIES) {
							await announce(say.NOT_UNDERSTOOD);
							continue;
						}
						draft = await repairFrame(draft);
						misses = 0;
					} else {
						switch (command.kind) {
							case 'stop':
								throw new Aborted();
							case 'back':
								return Math.max(1, position - 1);
							case 'goto':
								return clamp(command.position, 1, slots);
							case 'next':
								// Nothing was dictated, so the frame is what was announced:
								// drawn and empty. There is nothing to mishear, so commit it.
								writeDraft(index, draft);
								committed = true;
								return position + 1;
							case 'undo':
								draft = makeFrame(position);
								await announce(say.announceFrame(position));
								continue;
							case 'frame': {
								// At this prompt an utterance describes the whole frame, so it
								// replaces rather than merges; amendments happen at confirm.
								const applied = await applyCommand(makeFrame(position), command);
								if (!applied) continue;
								draft = applied;
								break;
							}
							case 'repeat':
								await announce(say.announceFrame(position));
								continue;
							default:
								// A bare number here is ambiguous — say so rather than
								// re-listening in silence.
								noteMiss();
								await announce(say.NOT_UNDERSTOOD);
								continue;
						}
					}

					const outcome = await confirmFrame(draft, position, index, slots);
					if (outcome.kind === 'commit') {
						committed = true;
						return position + 1;
					}
					if (outcome.kind === 'jump') return outcome.position;

					draft = outcome.draft;
					setPhase('frame');
					await announce(say.announceFrame(position));
				}
			} finally {
				if (!committed) writeDraft(index, snapshot);
			}
		},
		[announce, applyCommand, ask, confirmFrame, guard, noteMiss, repairFrame, writeDraft],
	);

	const stop = useCallback(() => {
		runningRef.current = false;
		setRunning(false);
		io.cancel();
		setPhase('idle');
		// Audible acknowledgement — with the phone pocketed there is nothing to see.
		void io.speak(say.STOPPED);
	}, [io]);

	// Leaving the step must end the dialogue; cancelling I/O alone would leave the
	// loop running and still writing into an unmounted form.
	const teardownRef = useRef(io.cancel);
	teardownRef.current = io.cancel;
	useEffect(
		() => () => {
			runningRef.current = false;
			teardownRef.current();
		},
		[],
	);

	const start = useCallback(async () => {
		if (runningRef.current) return;
		if (!io.supported) {
			setError('Ta przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome na Androidzie.');
			return;
		}

		// A previous run may still be unwinding; let it finish so its teardown
		// cannot tear down this one.
		const previous = loopRef.current;
		if (previous) {
			runningRef.current = false;
			io.cancel();
			await previous;
		}

		runningRef.current = true;
		missStreakRef.current = 0;
		setRunning(true);
		setError(null);
		setLog([]);
		await io.primeMicrophone();

		const task = (async () => {
			try {
				const slots = await askSlots();
				apiRef.current.setSlots(slots);
				// Resize rather than rebuild: frames already entered — by hand or by an
				// earlier run — survive, and each is overwritten only once confirmed.
				const existing = apiRef.current.getFrames();
				apiRef.current.setFrames(
					Array.from({ length: slots }, (_, i) => ({
						...(existing[i] ?? makeFrame(i + 1)),
						position: i + 1,
					})),
				);

				let position = 1;
				while (position <= slots) {
					guard();
					position = await runFrame(position, slots);
				}

				guard();
				setPhase('done');
				await announce(say.FINISHED);
			} catch (failure) {
				if (!(failure instanceof Aborted)) {
					console.error('Voice dialogue failed:', failure);
					setError('Rozpoznawanie mowy przerwane. Spróbuj ponownie albo wpisz ręcznie.');
				}
				setPhase('idle');
			} finally {
				runningRef.current = false;
				setRunning(false);
				io.cancel();
			}
		})();

		loopRef.current = task;
		try {
			await task;
		} finally {
			if (loopRef.current === task) loopRef.current = null;
		}
	}, [announce, askSlots, guard, io, runFrame]);

	return { supported: io.supported, running, phase, log, error, start, stop };
}
