'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { parseCommand, type Command } from './grammar';
import { ListenError, useSpeechIO } from './useSpeechIO';

/**
 * The machinery every spoken dialogue needs, with nothing about frames or
 * inspections in it: one speak/listen turn, the give-up rule, abort handling,
 * a transcript for the screen, and serialised start/stop.
 *
 * Step scripts sit on top of this. Keeping it separate is what lets the comb
 * loop and the declarative field scripts share the same retry, abort and
 * transcript behaviour instead of each inventing their own.
 */

/**
 * Consecutive turns we can fail to understand before giving up. Without this a
 * dialogue would keep asking forever while the phone sits in a pocket.
 */
export const MAX_MISS_STREAK = 4;
/** Retries at a single prompt before a script falls back to something simpler. */
export const MAX_RETRIES = 2;
/**
 * How a turn paces its listening.
 *
 * Chrome on Android ends a quiet session after about five seconds whatever
 * `continuous` says, and plays a start earcon on every `recognition.start()`
 * that no page can silence. Coverage therefore *is* `start()` calls, and pings
 * *are* coverage: no schedule both listens continuously and stays quiet.
 *
 * Which way to lean is settled by what a gap actually costs. Speech during one is
 * lost silently — the beekeeper answers, hears nothing, and cannot tell whether
 * it registered — so in a form whose job is capturing answers a gap is worse than
 * a ping. With a five-second cycle the gap sets the share of time we can hear at
 * all: 2s is 71%, 5s is 50%, 12s only 29%. Hence the ceiling of 5s below.
 *
 * The cheaper lever is the lead-in. Silence we can predict — the beekeeper cannot
 * answer while still lifting a frame — costs nothing to sit out, where a gap buys
 * quiet by gambling that they will not speak. Spend the predictable silence up
 * front, then stay near-continuous once an answer is actually plausible.
 */
export type Pacing = 'prompt' | 'work';

interface PacingProfile {
	/** Quiet time before the mic opens at all. */
	leadInMs: number;
	/** Quiet time before each reopen; the length is how many reopens a turn gets. */
	gapsMs: number[];
}

export const PACING: Record<Pacing, PacingProfile> = {
	/**
	 * Answering a question just asked — a status, a colour, "dalej". The reply
	 * comes within a couple of seconds or it is not coming, so open at once and
	 * reopen back-to-back. Ordinarily the beekeeper answers inside the first cycle
	 * and hears a single ping; the rest of the schedule only ever appears when
	 * something has already gone wrong.
	 */
	prompt: { leadInMs: 0, gapsMs: [0, 0] },
	/**
	 * Dictating a frame. There is nothing to say until it is out and read, so the
	 * lead-in sits out a silence we could have predicted rather than spending a
	 * ping on it. After that the gaps stay short — this is the step whose answers
	 * the report is actually made of, and dropping one is worse than a ping.
	 */
	work: { leadInMs: 3_000, gapsMs: [0, 2_000, 4_000, 5_000, 5_000] },
};
/** Transcript length kept for scrolling back through. */
export const MAX_LOG_TURNS = 200;

/** Thrown to unwind the async loop when the dialogue is stopped. */
export class Aborted extends Error {}

export interface DialogueTurn {
	role: 'app' | 'you';
	text: string;
}

/**
 * Where the dialogue currently is. Published by whichever script is running so
 * the screen can follow the conversation: the bar shows the running summary,
 * and the form scrolls the field being asked into view.
 */
export interface DialogueStatus {
	stepKey: string | null;
	/** Form field name currently being asked, when the step has discrete fields. */
	fieldName: string | null;
	/** What has been captured for this step so far, in the same words as the read-back. */
	summary: string | null;
}

const IDLE_STATUS: DialogueStatus = { stepKey: null, fieldName: null, summary: null };

/**
 * The recogniser hands back lower-case text. The app's own lines are written as
 * sentences, so capitalising the first letter is what makes the two sides of the
 * transcript read as one conversation rather than a log.
 */
export const sentenceCase = (text: string) => text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('pl-PL'));

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface DialogueRuntime {
	supported: boolean;
	running: boolean;
	/**
	 * Whether the mic is open right now, as opposed to the dialogue merely being
	 * under way. The two differ during the quiet gaps between reopens, and the
	 * panel has to show the difference — anything said into a shut mic is lost.
	 */
	listening: boolean;
	log: DialogueTurn[];
	error: string | null;
	setError: (message: string | null) => void;
	/** Say something, and record it in the transcript. */
	announce: (text: string) => Promise<void>;
	/** One turn in; the first alternative the grammar accepts, or null. */
	ask: (pacing?: Pacing) => Promise<Command | null>;
	/**
	 * One turn in, interpreted by the caller's own matcher — how a step script
	 * recognises its own vocabulary while sharing the retry and miss accounting.
	 *
	 * `pacing` says what the beekeeper is doing while we wait, which is the only
	 * thing that makes a listening schedule right or wrong; it defaults to
	 * answering a question, since most turns are that.
	 */
	askWith: <T>(match: (transcript: string) => T | null, pacing?: Pacing) => Promise<T | null>;
	/** Count a turn we could not act on. Throws Aborted once they pile up. */
	noteMiss: () => null;
	/** Throws Aborted if the dialogue has been stopped. Call after every await. */
	guard: () => void;
	/** Clear the miss streak — for a script entering a simpler fallback. */
	resetMisses: () => void;
	status: DialogueStatus;
	/** Scripts call this as they advance so the screen can follow along. */
	setStatus: (patch: Partial<DialogueStatus>) => void;
	/** Run a dialogue body, serialised against any previous run. */
	run: (body: () => Promise<void>) => Promise<void>;
	stop: () => void;
}

export function useDialogueRuntime(): DialogueRuntime {
	const io = useSpeechIO();
	const [running, setRunning] = useState(false);
	const [listening, setListening] = useState(false);
	const [log, setLog] = useState<DialogueTurn[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatusState] = useState<DialogueStatus>(IDLE_STATUS);

	const runningRef = useRef(false);
	const missStreakRef = useRef(0);
	/** The in-flight dialogue, so a restart can wait for it to unwind. */
	const loopRef = useRef<Promise<void> | null>(null);

	const push = useCallback((role: DialogueTurn['role'], text: string) => {
		// Kept in full so the expanded view can scroll back over the whole
		// exchange; capped only to bound memory on a very long session.
		setLog((entries) => [...entries, { role, text: role === 'you' ? sentenceCase(text) : text }].slice(-MAX_LOG_TURNS));
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

	const noteMiss = useCallback((): null => {
		missStreakRef.current += 1;
		if (missStreakRef.current >= MAX_MISS_STREAK) {
			setError('Nie słyszę odpowiedzi — sterowanie głosem zatrzymane. Możesz wpisać dane ręcznie.');
			throw new Aborted();
		}
		return null;
	}, []);

	const resetMisses = useCallback(() => {
		missStreakRef.current = 0;
	}, []);

	const setStatus = useCallback((patch: Partial<DialogueStatus>) => {
		setStatusState((current) => ({ ...current, ...patch }));
	}, []);

	const askWith = useCallback(
		async <T>(match: (transcript: string) => T | null, pacing: Pacing = 'prompt'): Promise<T | null> => {
			guard();
			const profile = PACING[pacing];

			// Silence we already knew about; opening the mic through it would spend a
			// ping on a stretch nobody was going to speak in.
			if (profile.leadInMs > 0) {
				await pause(profile.leadInMs);
				guard();
			}

			let alternatives: string[] = [];
			// Silence is not misrecognition. The recogniser gives up on quiet after a
			// few seconds, which is far less time than putting one frame down and
			// lifting the next — so open the mic again, saying nothing. The waiting
			// happens with the mic shut, because reopening it is what pings.
			for (let quiet = 0; ; quiet += 1) {
				try {
					setListening(true);
					alternatives = await io.listen();
					setListening(false);
					break;
				} catch (failure) {
					guard();
					if (failure instanceof ListenError && failure.reason === 'not-allowed') {
						setListening(false);
						setError('Brak dostępu do mikrofonu. Zezwól na mikrofon albo wpisz dane ręcznie.');
						throw new Aborted();
					}
					const gap = profile.gapsMs[quiet];
					if (failure instanceof ListenError && failure.reason === 'no-speech' && gap !== undefined) {
						// The early gaps are zero: reopen at once, and leave the indicator
						// lit rather than blinking it off for the instant in between.
						if (gap > 0) {
							setListening(false);
							await pause(gap);
							guard();
						}
						continue;
					}
					setListening(false);
					// Long enough to be worth a nudge, or a failure that is not silence.
					return noteMiss();
				}
			}
			guard();

			// Several readings of the same audio; take the first the caller accepts.
			for (const transcript of alternatives) {
				const matched = match(transcript);
				if (matched !== null && matched !== undefined) {
					missStreakRef.current = 0;
					push('you', transcript);
					return matched;
				}
			}
			if (alternatives[0]) push('you', alternatives[0]);
			return noteMiss();
		},
		[guard, io, noteMiss, push],
	);

	const ask = useCallback((pacing?: Pacing) => askWith(parseCommand, pacing), [askWith]);

	const stop = useCallback(() => {
		const wasRunning = runningRef.current;
		runningRef.current = false;
		setRunning(false);
		setListening(false);
		io.cancel();
		// Audible acknowledgement — with the phone pocketed there is nothing to
		// see. Only when something was actually interrupted.
		if (wasRunning) void io.speak('Przerwane.');
	}, [io]);

	// Leaving the screen must end the dialogue; cancelling I/O alone would leave
	// the loop running and still writing into an unmounted form.
	const teardownRef = useRef(io.cancel);
	useEffect(() => {
		teardownRef.current = io.cancel;
	}, [io.cancel]);
	useEffect(
		() => () => {
			runningRef.current = false;
			teardownRef.current();
		},
		[],
	);

	const run = useCallback(
		async (body: () => Promise<void>) => {
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
					await body();
				} catch (failure) {
					if (!(failure instanceof Aborted)) {
						console.error('Voice dialogue failed:', failure);
						setError('Sterowanie głosem przerwane. Spróbuj ponownie albo wpisz ręcznie.');
					}
				} finally {
					runningRef.current = false;
					setRunning(false);
					setListening(false);
					// The transcript stays for reading; the pointer into the form does not.
					setStatusState((current) => ({ ...current, fieldName: null }));
					io.cancel();
				}
			})();

			loopRef.current = task;
			try {
				await task;
			} finally {
				if (loopRef.current === task) loopRef.current = null;
			}
		},
		[io],
	);

	return {
		supported: io.supported,
		running,
		listening,
		log,
		error,
		setError,
		announce,
		ask,
		askWith,
		noteMiss,
		guard,
		resetMisses,
		status,
		setStatus,
		run,
		stop,
	};
}
