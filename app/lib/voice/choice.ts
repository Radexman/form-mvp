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
 * How much of the utterance one phrase claims: its length when it hits, 0 when
 * it does not. A phrase matches as a whole word, or as the stem of one, which
 * covers Polish inflection without listing every ending.
 */
function phraseHit(text: string, tokens: string[], phrase: string): number {
	const needle = normalize(phrase);
	if (!needle) return 0;

	const words = needle.split(' ');
	const hit = words.length > 1 ? text.includes(needle) : tokens.some((token) => tokenMatches(token, needle));

	return hit ? needle.length : 0;
}

/**
 * Longest phrase wins, so "nie widziana" beats the "widziana" inside it.
 */
export function matchChoice(raw: string, choices: Choice[]): string | null {
	const text = normalize(raw);
	if (!text) return null;
	const tokens = text.split(' ');

	let best: { value: string; length: number } | null = null;

	for (const choice of choices) {
		for (const phrase of choice.phrases) {
			const length = phraseHit(text, tokens, phrase);
			if (length > 0 && (!best || length > best.length)) {
				best = { value: choice.value, length };
			}
		}
	}

	return best?.value ?? null;
}

/** The two answers a multi-select needs that naming options cannot express. */
export interface MultiPhrases {
	/** Means none of them — "brak czerwiu" — and yields an empty list. */
	none?: string[];
	/** Means all of them — "wszystko". */
	all?: string[];
}

/**
 * A set rather than a single value: one utterance can name several options
 * ("jaja, larwy i kryty"), so every hit counts instead of only the longest.
 * Results come back in the order the options are declared, so the read-back
 * reads the same way whatever order they were spoken in.
 *
 * Returns [] only for an explicit none-phrase, and null when nothing matched —
 * the caller has to be able to tell "no brood" from "say that again".
 */
export function matchMulti(raw: string, choices: Choice[], phrases: MultiPhrases = {}): string[] | null {
	const text = normalize(raw);
	if (!text) return null;
	const tokens = text.split(' ');

	const hits = (list: string[] = []) => list.some((phrase) => phraseHit(text, tokens, phrase) > 0);
	const named = choices
		.filter((choice) => choice.phrases.some((phrase) => phraseHit(text, tokens, phrase) > 0))
		.map((choice) => choice.value);

	const none = hits(phrases.none);
	const all = hits(phrases.all);

	// "brak trutowego" names an option and denies it in the same breath, and
	// nothing here can tell which half was meant. Recording the option would be
	// the opposite of what was said, so re-ask instead of guessing.
	if (none && (named.length > 0 || all)) return null;
	if (all) return choices.map((choice) => choice.value);
	if (named.length > 0) return named;
	return none ? [] : null;
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

/**
 * A bare count, bounded by the field's own range.
 *
 * `synonyms` maps a value to the words that describe it — a rating is far more
 * often spoken as "zwarty" than as "pięć". Digits and number words are tried
 * first, so a spoken number is never reinterpreted as a description.
 */
export function matchNumber(raw: string, min: number, max: number, synonyms?: Record<number, string[]>): number | null {
	for (const token of normalize(raw).split(' ')) {
		const value = parseNumberToken(token);
		if (value !== null && value >= min && value <= max) return value;
	}

	if (!synonyms) return null;
	const described = matchChoice(
		raw,
		Object.entries(synonyms).map(([value, phrases]) => ({ value, phrases })),
	);
	if (described === null) return null;

	const value = Number(described);
	return value >= min && value <= max ? value : null;
}
