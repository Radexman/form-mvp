'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Browser plumbing for one speak / listen turn. Knows nothing about frames.
 *
 * The one rule this layer exists to enforce: never listen while the app is
 * talking. `speak` resolves only once the utterance has actually finished, and
 * `listen` adds a short settle delay on top, because Android fires `onend`
 * marginally before the audio stops and the recogniser will otherwise transcribe
 * our own prompt.
 *
 * The second rule, learned the hard way: one `listen` is exactly one
 * `recognition.start()`. Chrome on Android plays a start earcon that no page can
 * silence (crbug 40324711), so a restart loop hidden in here becomes a ping every
 * few seconds for as long as nobody speaks. Reopening is the caller's decision to
 * pace, not ours to hide.
 */

const LANG = 'pl-PL';
/** Android reports utterance end just before the speaker goes quiet. */
const ECHO_GUARD_MS = 250;
/**
 * Safety net only. Android's recogniser ends a quiet session after a few seconds
 * whatever `continuous` says, so in practice it is the engine that closes the
 * window, not us; this exists so a session that somehow never reports `end`
 * cannot hang the dialogue forever.
 *
 * It is deliberately NOT a "keep listening this long" budget. Chrome on Android
 * plays a start earcon on every `recognition.start()` and gives the page no way
 * to silence it, so holding a long window open by restarting the session turns
 * into a ping every few seconds — see the note above `listen`.
 */
const LISTEN_CEILING_MS = 25_000;
/** speechSynthesis occasionally drops onend entirely; never hang the dialogue on it. */
const SPEAK_TIMEOUT_BASE_MS = 2000;
const SPEAK_TIMEOUT_PER_CHAR_MS = 90;

export type ListenFailure = 'no-speech' | 'not-allowed' | 'network' | 'aborted' | 'unsupported' | 'other';

export class ListenError extends Error {
	constructor(readonly reason: ListenFailure) {
		super(reason);
		this.name = 'ListenError';
	}
}

function getRecognitionCtor(): SpeechRecognitionConstructor | undefined {
	if (typeof window === 'undefined') return undefined;
	return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
	return getRecognitionCtor() !== undefined && typeof window !== 'undefined' && 'speechSynthesis' in window;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SpeechIO {
	supported: boolean;
	/** Resolves when the utterance has finished playing. */
	speak: (text: string) => Promise<void>;
	/** One utterance in, best-first alternatives out. Rejects with ListenError. */
	listen: () => Promise<string[]>;
	/** Ask for the mic up front so the permission sheet does not interrupt a prompt. */
	primeMicrophone: () => Promise<void>;
	cancel: () => void;
}

export function useSpeechIO(): SpeechIO {
	const recognitionRef = useRef<SpeechRecognition | null>(null);
	const cancelledRef = useRef(false);
	/** Resolved once, lazily: whether pl-PL can run on-device. */
	const localPreferenceRef = useRef<Promise<boolean> | null>(null);

	const supported = useMemo(() => isSpeechSupported(), []);

	/**
	 * Signal is poor at the apiary and Chrome's default recogniser is server-side,
	 * so use an on-device language pack when there is one. Downloading is kicked
	 * off but never awaited — this turn still goes over the network.
	 */
	const prefersLocal = useCallback(async () => {
		const Ctor = getRecognitionCtor();
		if (!Ctor?.available) return false;
		try {
			const availability = await Ctor.available({ langs: [LANG], quality: 'command', processLocally: true });
			if (availability === 'available') return true;
			if (availability === 'downloadable' && Ctor.install) {
				void Ctor.install({ langs: [LANG], quality: 'command' }).catch(() => {});
			}
		} catch {
			// Older Chrome throws on the options shape; fall through to remote.
		}
		return false;
	}, []);

	/**
	 * Probed once and cached, answer either way. Re-probing each turn would only
	 * add latency before the mic opens: Chrome on Android exposes `available()` but
	 * ships no on-device models, so there it is a standing "unavailable" — the
	 * on-device path is a desktop nicety, not the fix for anything on a phone.
	 */
	const resolveLocal = useCallback(() => (localPreferenceRef.current ??= prefersLocal()), [prefersLocal]);

	const speak = useCallback(
		(text: string) =>
			new Promise<void>((resolve) => {
				if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve();

				window.speechSynthesis.cancel();
				const utterance = new SpeechSynthesisUtterance(text);
				utterance.lang = LANG;
				utterance.rate = 1.05;

				let done = false;
				const finish = () => {
					if (done) return;
					done = true;
					clearTimeout(timer);
					resolve();
				};
				const timer = setTimeout(finish, SPEAK_TIMEOUT_BASE_MS + text.length * SPEAK_TIMEOUT_PER_CHAR_MS);

				utterance.onend = finish;
				utterance.onerror = finish;
				window.speechSynthesis.speak(utterance);
			}),
		[],
	);

	const listen = useCallback(async () => {
		const Ctor = getRecognitionCtor();
		if (!Ctor) throw new ListenError('unsupported');

		await delay(ECHO_GUARD_MS);
		if (cancelledRef.current) throw new ListenError('aborted');

		const useLocal = await resolveLocal();
		// The availability probe can outlast a Stop; without this the mic would
		// open after the user has already ended the dialogue.
		if (cancelledRef.current) throw new ListenError('aborted');

		return new Promise<string[]>((resolve, reject) => {
			const recognition = new Ctor();
			recognition.lang = LANG;
			// Asks the engine to hold the session open across the pauses while a frame
			// is set down and the next one lifted. Chrome's on-device recogniser obeys
			// this; the server-side one on Android ignores it and ends on quiet anyway,
			// which is why the caller paces the reopens instead of us looping here.
			recognition.continuous = true;
			recognition.interimResults = false;
			// Several readings of the same audio; the parser tries each in turn.
			recognition.maxAlternatives = 5;
			if (useLocal) {
				try {
					recognition.processLocally = true;
				} catch {
					// Property is absent on older builds — remote is fine.
				}
			}
			recognitionRef.current = recognition;

			let settled = false;

			const settle = (run: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(window_);
				recognitionRef.current = null;
				try {
					recognition.stop();
				} catch {
					// Already stopped; nothing to unwind.
				}
				run();
			};

			const window_ = setTimeout(() => settle(() => reject(new ListenError('no-speech'))), LISTEN_CEILING_MS);

			recognition.onresult = (event) => {
				// Continuous sessions accumulate results; take the newest one.
				const result = event.results[event.resultIndex];
				if (!result) return;
				const alternatives = Array.from({ length: result.length }, (_, i) => result[i].transcript);
				settle(() => resolve(alternatives));
			};
			recognition.onerror = (event) => {
				const reason: ListenFailure =
					event.error === 'no-speech' || event.error === 'not-allowed' || event.error === 'network'
						? event.error
						: event.error === 'aborted'
							? 'aborted'
							: 'other';
				settle(() => reject(new ListenError(reason)));
			};
			// Chrome ends the session silently when it heard nothing usable. Reporting
			// that up rather than restarting here is the point: the caller decides when
			// the mic opens again, and every reopen costs an audible ping.
			recognition.onend = () => settle(() => reject(new ListenError('no-speech')));

			try {
				recognition.start();
			} catch {
				settle(() => reject(new ListenError('other')));
			}
		});
	}, [resolveLocal]);

	const primeMicrophone = useCallback(async () => {
		cancelledRef.current = false;
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach((track) => track.stop());
		} catch {
			// Denied or unavailable; listen() will surface it properly.
		}
	}, []);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
		recognitionRef.current?.abort();
		recognitionRef.current = null;
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
	}, []);

	useEffect(() => cancel, [cancel]);

	return { supported, speak, listen, primeMicrophone, cancel };
}
