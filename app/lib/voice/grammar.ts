import type { CombCondition, CombState, FrameResource } from '../../components/inspection/steps/comb/comb.schema';

/**
 * Polish command grammar for frame entry. Pure — no React, no browser — so the
 * whole vocabulary is testable without a microphone, which is where the bugs
 * actually are.
 *
 * The grammar is deliberately narrow. At any prompt we expect a number, a
 * resource-and-number pair, or one of a handful of control words; free dictation
 * is never attempted.
 */

export const MAX_SPOKEN_NUMBER = 20;

/**
 * Lowercase, strip diacritics, drop punctuation. NFD handles ą/ć/ę/ń/ó/ś/ź/ż,
 * but ł is a distinct codepoint with no decomposition, so it is replaced first.
 */
export function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/ł/g, 'l')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Keys are already normalized — compare against normalize() output only. */
const CARDINALS: Record<string, number> = {
	zero: 0,
	jeden: 1,
	jedna: 1,
	jedno: 1,
	dwa: 2,
	dwie: 2,
	trzy: 3,
	cztery: 4,
	piec: 5,
	pol: 5, // "pół" — half a frame
	szesc: 6,
	siedem: 7,
	osiem: 8,
	dziewiec: 9,
	dziesiec: 10,
	jedenascie: 11,
	dwanascie: 12,
	trzynascie: 13,
	czternascie: 14,
	pietnascie: 15,
	szesnascie: 16,
	siedemnascie: 17,
	osiemnascie: 18,
	dziewietnascie: 19,
	dwadziescia: 20,
};

/** Feminine ordinals — "ramka" is feminine. Index 0 is position 1. */
const FEMININE_ORDINALS = [
	'pierwsza',
	'druga',
	'trzecia',
	'czwarta',
	'piąta',
	'szósta',
	'siódma',
	'ósma',
	'dziewiąta',
	'dziesiąta',
	'jedenasta',
	'dwunasta',
	'trzynasta',
	'czternasta',
	'piętnasta',
	'szesnasta',
	'siedemnasta',
	'osiemnasta',
	'dziewiętnasta',
	'dwudziesta',
];

/** Spoken ordinal for a frame position, e.g. 3 -> "trzecia". */
export function ordinalPl(position: number): string {
	return FEMININE_ORDINALS[position - 1] ?? String(position);
}

const ORDINAL_TO_NUMBER: Record<string, number> = Object.fromEntries(
	FEMININE_ORDINALS.map((word, index) => [normalize(word), index + 1]),
);

/**
 * Stem prefixes rather than a list of inflections, so "miodu", "czerwiu" and
 * "pierzgi" fall out for free. Ordered longest-first where stems overlap.
 */
const RESOURCE_STEMS: [string, FrameResource][] = [
	// "miód" is /mjut/, so the recogniser writes it back phonetically as often as
	// correctly — miut, mjut, miot. Each spelling gets a stem rather than relying
	// on one, and "nektar" is kept as the reliable synonym to fall back on.
	['miod', 'honey'],
	['mio', 'honey'], // miot, mios
	['miu', 'honey'], // miut, miud
	['mju', 'honey'], // mjut, mjud
	['nektar', 'honey'],
	['czerw', 'brood'],
	['pierzg', 'pollen'],
	// "pyłek" is /pɨwek/, and Polish y is written back as i or u about as often
	// as itself — piłek, pułek. The stem is the p + vowel + l opening, which is
	// what survives every spelling of it.
	['pyl', 'pollen'],
	['pil', 'pollen'],
	['pul', 'pollen'],
];

const WEAR_STEMS: [string, CombCondition][] = [
	['dobr', 'good'],
	['star', 'old'],
	['wymian', 'needs_replacement'],
	['wymien', 'needs_replacement'],
];

const FOUNDATION_STEMS = ['wez']; // węza, węzy, wezę
const EMPTY_STEMS = ['pust']; // pusta, puste, pusty
/**
 * "dobrze" and "dobra" are the most natural Polish confirmations, and they also
 * prefix-match the `dobr` wear stem. Confirmation wins: wear defaults to good
 * anyway, so losing them as a way to *set* good costs nothing, while losing them
 * as a way to say yes would strand the confirm prompt.
 */
const NEXT_WORDS = [
	'dalej',
	'nastepna',
	'nastepny',
	// Echoing the question back — "kolejna ramka", "przejdź do kolejnej sekcji" —
	// is a natural way to answer it. Matching is exact, so the inflections the
	// question itself uses have to be listed alongside the base forms; neither
	// noun needs matching for any of it to work.
	'kolejna',
	'kolejny',
	'kolejne',
	'kolejnej',
	'kolejnego',
	'kolejnych',
	'nastepnej',
	'nastepnego',
	'przejdz',
	'przejsc',
	'zapisz',
	'tak',
	'ok',
	'okej',
	'gotowe',
	'dobrze',
	'dobra',
];
const BACK_WORDS = ['wstecz', 'poprzednia', 'poprzedni'];
const UNDO_WORDS = ['cofnij', 'popraw', 'poprawka', 'zle', 'nie'];
const REPEAT_WORDS = ['powtorz', 'powtorka'];
const STOP_WORDS = ['stop', 'koniec', 'zakoncz', 'przerwij'];

function stemOf<T>(token: string, table: [string, T][]): T | null {
	for (const [stem, value] of table) {
		if (token.startsWith(stem)) return value;
	}
	return null;
}

function startsWithAny(token: string, stems: string[]): boolean {
	return stems.some((stem) => token.startsWith(stem));
}

/** A number word or a spoken digit string, within the 0..20 we ever ask for. */
export function parseNumberToken(token: string): number | null {
	const word = CARDINALS[token];
	if (word !== undefined) return word;
	if (!/^\d{1,2}$/.test(token)) return null;
	const digits = Number(token);
	return digits >= 0 && digits <= MAX_SPOKEN_NUMBER ? digits : null;
}

export type FrameCommand = {
	kind: 'frame';
	/** Only the resources actually named — absent keys are left untouched. */
	values: Partial<Record<FrameResource, number>>;
	wear?: CombCondition;
	state?: CombState;
};

/** Navigation and correction, with no field content of any kind. */
export type ControlCommand =
	{ kind: 'next' } | { kind: 'back' } | { kind: 'undo' } | { kind: 'repeat' } | { kind: 'stop' };

export type Command =
	| FrameCommand
	| { kind: 'next' }
	| { kind: 'back' }
	| { kind: 'undo' }
	| { kind: 'repeat' }
	| { kind: 'stop' }
	| { kind: 'number'; value: number }
	| { kind: 'goto'; position: number };

/**
 * Navigation only. Field scripts compose this behind their own matcher, so
 * "wstecz" and "stop" work at every prompt without the frame vocabulary
 * leaking into steps that have no frames.
 */
export function parseControl(raw: string): ControlCommand | null {
	const tokens = normalize(raw).split(' ').filter(Boolean);
	if (tokens.length === 0) return null;

	if (tokens.some((token) => STOP_WORDS.includes(token))) return { kind: 'stop' };
	// Backwards before forwards: "przejdź" now counts as going on, so "przejdź
	// wstecz" would otherwise be read as the opposite of what was said. Nothing
	// in BACK_WORDS ever means "next", so checking it first is free.
	if (tokens.some((token) => BACK_WORDS.includes(token))) return { kind: 'back' };
	if (tokens.some((token) => NEXT_WORDS.includes(token))) return { kind: 'next' };
	if (tokens.some((token) => UNDO_WORDS.includes(token))) return { kind: 'undo' };
	if (tokens.some((token) => REPEAT_WORDS.includes(token))) return { kind: 'repeat' };
	return null;
}

/**
 * Interpret one utterance. Returns null when nothing in the grammar matched, so
 * the caller can re-ask rather than act on noise.
 */
export function parseCommand(raw: string): Command | null {
	const tokens = normalize(raw).split(' ').filter(Boolean);
	if (tokens.length === 0) return null;

	if (tokens.some((token) => STOP_WORDS.includes(token))) return { kind: 'stop' };

	// "ramka trzecia" / "ramka 3" — jump, checked before bare numbers claim it.
	const frameWordAt = tokens.findIndex((token) => token.startsWith('ramk'));
	if (frameWordAt >= 0 && frameWordAt + 1 < tokens.length) {
		const next = tokens[frameWordAt + 1];
		const position = ORDINAL_TO_NUMBER[next] ?? parseNumberToken(next);
		if (position !== null && position >= 1) {
			return { kind: 'goto', position };
		}
	}

	const values: Partial<Record<FrameResource, number>> = {};
	let wear: CombCondition | undefined;
	let state: CombState | undefined;
	let sawFrameContent = false;

	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];

		// Confirmations are never frame content, even when they look like a stem.
		if (NEXT_WORDS.includes(token)) continue;

		if (startsWithAny(token, FOUNDATION_STEMS)) {
			state = 'foundation';
			sawFrameContent = true;
			continue;
		}
		if (startsWithAny(token, EMPTY_STEMS)) {
			values.brood = 0;
			values.honey = 0;
			values.pollen = 0;
			state = 'drawn';
			sawFrameContent = true;
			continue;
		}

		const condition = stemOf(token, WEAR_STEMS);
		if (condition) {
			wear = condition;
			sawFrameContent = true;
			continue;
		}

		// "miód osiem" — resource then value.
		const resource = stemOf(token, RESOURCE_STEMS);
		if (resource) {
			const value = i + 1 < tokens.length ? parseNumberToken(tokens[i + 1]) : null;
			if (value !== null) {
				values[resource] = value;
				sawFrameContent = true;
				i += 1;
			}
			continue;
		}

		// "osiem miodu" — value then resource.
		const leading = parseNumberToken(token);
		if (leading !== null && i + 1 < tokens.length) {
			const trailing = stemOf(tokens[i + 1], RESOURCE_STEMS);
			if (trailing) {
				values[trailing] = leading;
				sawFrameContent = true;
				i += 1;
			}
		}
	}

	if (sawFrameContent) return { kind: 'frame', values, wear, state };

	if (tokens.some((token) => NEXT_WORDS.includes(token))) return { kind: 'next' };
	if (tokens.some((token) => BACK_WORDS.includes(token))) return { kind: 'back' };
	if (tokens.some((token) => UNDO_WORDS.includes(token))) return { kind: 'undo' };
	if (tokens.some((token) => REPEAT_WORDS.includes(token))) return { kind: 'repeat' };

	// A bare number, which only the "how many slots" prompt can use.
	for (const token of tokens) {
		const value = parseNumberToken(token);
		if (value !== null) return { kind: 'number', value };
	}

	return null;
}
