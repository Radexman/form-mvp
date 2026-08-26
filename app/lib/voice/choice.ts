import { normalize, parseNumberToken } from './grammar';

/**
 * Matching a spoken answer against a closed set of choices.
 *
 * Pure, so a step's whole vocabulary can be tested without a microphone. Kept
 * apart from grammar.ts because that file is the frame-composition language;
 * this is the general "pick one of these" language every other step needs.
 */

export interface Choice {
	value: string;
	/** Spoken forms. The option's own Polish label is usually one of them. */
	phrases: string[];
}

/**
 * Stem matching needs a floor. "nie" is a prefix of "niebieski", "niewidziana"
 * and "nieznakowana", so short words must match a whole token or they swallow
 * every answer that happens to begin with them.
 */
const MIN_PREFIX_LENGTH = 4;

const tokenMatches = (token: string, needle: string) =>
	token === needle || (needle.length >= MIN_PREFIX_LENGTH && token.startsWith(needle));

/**
 * Build choices from an options list, so the UI label is spoken vocabulary by
 * default and only genuinely different field speech needs writing out.
 */
export function choicesFrom(
	options: { value: string; label: string }[],
	synonyms: Record<string, string[]> = {},
): Choice[] {
	return options.map((option) => ({
		value: option.value,
		phrases: [option.label, ...(synonyms[option.value] ?? [])],
	}));
}

/**
 * Longest phrase wins, so "nie widziana" beats the "widziana" inside it. A
 * phrase matches as a whole word, or as the stem of one, which covers Polish
 * inflection without listing every ending.
 */
export function matchChoice(raw: string, choices: Choice[]): string | null {
	const text = normalize(raw);
	if (!text) return null;
	const tokens = text.split(' ');

	let best: { value: string; length: number } | null = null;

	for (const choice of choices) {
		for (const phrase of choice.phrases) {
			const needle = normalize(phrase);
			if (!needle) continue;

			const words = needle.split(' ');
			const hit = words.length > 1 ? text.includes(needle) : tokens.some((token) => tokenMatches(token, needle));

			if (hit && (!best || needle.length > best.length)) {
				best = { value: choice.value, length: needle.length };
			}
		}
	}

	return best?.value ?? null;
}

const YES = ['tak', 'jest', 'owszem', 'oczywiscie', 'potwierdzam', 'zgadza'];
const NO = ['nie', 'brak', 'nieobecna', 'zadnych'];

/** Yes/no, with the caller free to add field-specific wording. */
export function matchBoolean(raw: string, extraYes: string[] = [], extraNo: string[] = []): boolean | null {
	const tokens = normalize(raw).split(' ').filter(Boolean);
	if (tokens.length === 0) return null;

	// "nie" first: "nie znakowana" must not be read as the "znakowana" inside it.
	const no = [...NO, ...extraNo].map(normalize);
	if (tokens.some((token) => no.some((word) => tokenMatches(token, word)))) return false;

	const yes = [...YES, ...extraYes].map(normalize);
	if (tokens.some((token) => yes.some((word) => tokenMatches(token, word)))) return true;

	return null;
}

/** A bare count, bounded by the field's own range. */
export function matchNumber(raw: string, min: number, max: number): number | null {
	for (const token of normalize(raw).split(' ')) {
		const value = parseNumberToken(token);
		if (value !== null && value >= min && value <= max) return value;
	}
	return null;
}
