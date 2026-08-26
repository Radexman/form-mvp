/**
 * Web Speech API recognition types.
 *
 * TypeScript's lib.dom ships SpeechRecognitionResult / -Alternative / -ResultList
 * but not SpeechRecognition itself, its events, or the vendor-prefixed
 * constructor — so they are declared here. The on-device members
 * (processLocally / available / install) are newer than lib.dom entirely.
 */

interface SpeechRecognitionEventMap {
	audioend: Event;
	audiostart: Event;
	end: Event;
	error: SpeechRecognitionErrorEvent;
	nomatch: SpeechRecognitionEvent;
	result: SpeechRecognitionEvent;
	soundend: Event;
	soundstart: Event;
	speechend: Event;
	speechstart: Event;
	start: Event;
}

type SpeechRecognitionErrorCode =
	| 'aborted'
	| 'audio-capture'
	| 'bad-grammar'
	| 'language-not-supported'
	| 'network'
	| 'no-speech'
	| 'not-allowed'
	| 'service-not-allowed';

interface SpeechRecognitionErrorEvent extends Event {
	readonly error: SpeechRecognitionErrorCode;
	readonly message: string;
}

interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number;
	readonly results: SpeechRecognitionResultList;
}

/** Availability of a language for recognition, on-device or remote. */
type SpeechRecognitionAvailability = 'available' | 'downloading' | 'downloadable' | 'unavailable';

interface SpeechRecognitionOptions {
	langs: string[];
	quality?: 'command' | 'dictation' | 'conversation';
	processLocally?: boolean;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	maxAlternatives: number;
	/** When true, recognition must run on-device; otherwise the UA may use a server. */
	processLocally: boolean;

	abort(): void;
	start(): void;
	stop(): void;

	onaudioend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onaudiostart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
	onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
	onsoundend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onsoundstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onspeechend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onspeechstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
	onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;

	addEventListener<K extends keyof SpeechRecognitionEventMap>(
		type: K,
		listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<K extends keyof SpeechRecognitionEventMap>(
		type: K,
		listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => unknown,
		options?: boolean | EventListenerOptions,
	): void;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognition;
	prototype: SpeechRecognition;
	available?(options: SpeechRecognitionOptions): Promise<SpeechRecognitionAvailability>;
	install?(options: SpeechRecognitionOptions): Promise<boolean>;
}

interface Window {
	SpeechRecognition?: SpeechRecognitionConstructor;
	webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
