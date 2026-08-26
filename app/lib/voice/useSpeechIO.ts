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
 */

const LANG = 'pl-PL';
/** Android reports utterance end just before the speaker goes quiet. */
const ECHO_GUARD_MS = 250;
/**
 * How long one listening window stays open. Long enough to put a frame back and
 * lift the next without the dialogue giving up on us.
 *
 * Android does not honour this on its own: its recogniser abandons a session
 * after a few seconds of quiet whatever `continuous` says, so the window is held
 * open by restarting the session in place until the budget runs out.
 */
const LISTEN_WINDOW_MS = 25_000;
/** Android throws if recognition is restarted the instant the previous session ends. */
const RESTART_GAP_MS = 120;
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
	/** In-flight probe of whether pl-PL can run on-device. */
	const localProbeRef = useRef<Promise<boolean> | null>(null);
	/** Latched once the on-device pack is confirmed; from then on the probe is skipped. */
	const localReadyRef = useRef(false);

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
	 * A "no" is never cached: the pack `prefersLocal` asked for may still be
	 * downloading, and caching the first answer would keep the whole session on the
	 * server recogniser — the one that ends every few seconds and beeps on restart.
	 */
	const resolveLocal = useCallback(async () => {
		if (localReadyRef.current) return true;
		localProbeRef.current ??= prefersLocal();
		const ready = await localProbeRef.current;
		if (ready) localReadyRef.current = true;
		else localProbeRef.current = null;
		return ready;
	}, [prefersLocal]);

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
			// this; the server-side one on Android does not, which is why `reopen`
			// below exists.
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

			const deadline = Date.now() + LISTEN_WINDOW_MS;
			let settled = false;
			/** Set between an early `end` and the `start` that answers it. */
			let restarting = false;

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

			// Bounds the window ourselves, since the engine's own silence timeout is
			// what we are trying to avoid leaning on.
			const window_ = setTimeout(() => settle(() => reject(new ListenError('no-speech'))), LISTEN_WINDOW_MS);

			/**
			 * The engine gave up on the quiet before we meant to. Reopen the same
			 * session rather than rejecting: unwinding to the caller costs a spoken
			 * re-prompt and counts against the miss streak, when all that happened is
			 * that the beekeeper was still lifting a frame.
			 */
			const reopen = () => {
				if (settled) return;
				if (cancelledRef.current) {
					settle(() => reject(new ListenError('aborted')));
					return;
				}
				if (Date.now() >= deadline) {
					settle(() => reject(new ListenError('no-speech')));
					return;
				}
				restarting = true;
				setTimeout(() => {
					restarting = false;
					if (settled) return;
					// Stopped inside the gap: there is no live session for cancel() to
					// abort, so unwind here or the caller waits out the whole window.
					if (cancelledRef.current) {
						settle(() => reject(new ListenError('aborted')));
						return;
					}
					try {
						recognition.start();
					} catch {
						settle(() => reject(new ListenError('other')));
					}
				}, RESTART_GAP_MS);
			};

			recognition.onresult = (event) => {
				// Continuous sessions accumulate results; take the newest one.
				const result = event.results[event.resultIndex];
				if (!result) return;
				const alternatives = Array.from({ length: result.length }, (_, i) => result[i].transcript);
				settle(() => resolve(alternatives));
			};
			recognition.onerror = (event) => {
				// Silence is not a failure here — it is the engine's own timeout, and
				// the `end` that follows it reopens the window.
				if (event.error === 'no-speech') return;
				const reason: ListenFailure =
					event.error === 'not-allowed' || event.error === 'network'
						? event.error
						: event.error === 'aborted'
							? 'aborted'
							: 'other';
				settle(() => reject(new ListenError(reason)));
			};
			// Chrome ends the session silently when it heard nothing usable.
			recognition.onend = () => {
				if (restarting) return;
				reopen();
			};

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
