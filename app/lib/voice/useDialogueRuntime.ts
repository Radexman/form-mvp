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
 * How many times the recogniser may time out on silence before the dialogue
 * says anything. Chrome gives up after roughly five seconds of quiet, which is
 * nowhere near long enough to set one frame down and lift the next, so waiting
 * quietly through several of those is the normal case rather than a problem.
 */
export const SILENT_RETRIES = 5;

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

export interface DialogueRuntime {
	supported: boolean;
	running: boolean;
	log: DialogueTurn[];
	error: string | null;
	setError: (message: string | null) => void;
	/** Say something, and record it in the transcript. */
	announce: (text: string) => Promise<void>;
	/** One turn in; the first alternative the grammar accepts, or null. */
	ask: () => Promise<Command | null>;
	/**
	 * One turn in, interpreted by the caller's own matcher — how a step script
	 * recognises its own vocabulary while sharing the retry and miss accounting.
	 */
	askWith: <T>(match: (transcript: string) => T | null) => Promise<T | null>;
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
	const [log, setLog] = useState<DialogueTurn[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatusState] = useState<DialogueStatus>(IDLE_STATUS);

	const runningRef = useRef(false);
	const missStreakRef = useRef(0);
	/** The in-flight dialogue, so a restart can wait for it to unwind. */
	const loopRef = useRef<Promise<void> | null>(null);

	const push = useCallback((role: DialogueTurn['role'], text: string) => {
		setLog((entries) => [...entries, { role, text }].slice(-10));
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
		async <T>(match: (transcript: string) => T | null): Promise<T | null> => {
			guard();

			let alternatives: string[] = [];
			// Silence is not misrecognition. The recogniser gives up on quiet after
			// a few seconds, which is far less time than putting one frame down and
			// lifting the next — so just start listening again, saying nothing.
			for (let quiet = 0; ; quiet += 1) {
				try {
					alternatives = await io.listen();
					break;
				} catch (failure) {
					guard();
					if (failure instanceof ListenError && failure.reason === 'not-allowed') {
						setError('Brak dostępu do mikrofonu. Zezwól na mikrofon albo wpisz dane ręcznie.');
						throw new Aborted();
					}
					if (failure instanceof ListenError && failure.reason === 'no-speech' && quiet < SILENT_RETRIES) {
						continue;
					}
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

	const ask = useCallback(() => askWith(parseCommand), [askWith]);

	const stop = useCallback(() => {
		const wasRunning = runningRef.current;
		runningRef.current = false;
		setRunning(false);
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
