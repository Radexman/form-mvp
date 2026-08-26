import { describe, expect, it } from 'vitest';

import { choicesFrom, matchBoolean, matchChoice, matchMulti, matchNumber } from './choice';

const COLORS = choicesFrom(
	[
		{ value: 'white', label: 'Biały' },
		{ value: 'blue', label: 'Niebieski' },
	],
	{ blue: ['niebieska'] },
);

describe('choicesFrom', () => {
	it('makes the UI label spoken vocabulary for free', () => {
		expect(matchChoice('biały', COLORS)).toBe('white');
	});

	it('adds the field wording on top of the label', () => {
		expect(matchChoice('niebieska', COLORS)).toBe('blue');
	});
});

describe('matchChoice', () => {
	const STATUS = choicesFrom(
		[
			{ value: 'seen', label: 'Widziana' },
			{ value: 'not_seen_brood_ok', label: 'Niewidziana, czerw OK' },
		],
		{ not_seen_brood_ok: ['nie widziana'] },
	);

	// The shorter phrase is a substring of the longer one, so ordering matters.
	it('prefers the longest matching phrase', () => {
		expect(matchChoice('nie widziana', STATUS)).toBe('not_seen_brood_ok');
		expect(matchChoice('widziana', STATUS)).toBe('seen');
	});

	it('matches a stem, covering Polish inflection', () => {
		expect(matchChoice('niebieskiego', COLORS)).toBe('blue');
	});

	it('ignores diacritics and case, as the recogniser is inconsistent', () => {
		expect(matchChoice('BIALY', COLORS)).toBe('white');
	});

	it('returns null rather than guessing', () => {
		expect(matchChoice('yyy', COLORS)).toBeNull();
		expect(matchChoice('', COLORS)).toBeNull();
	});
});

describe('matchBoolean', () => {
	it('reads the plain yes and no words', () => {
		expect(matchBoolean('tak')).toBe(true);
		expect(matchBoolean('nie')).toBe(false);
	});

	it('takes field-specific wording', () => {
		expect(matchBoolean('znakowana', ['znakowana'])).toBe(true);
	});

	// "nieznakowana" contains "znakowana"; the negative has to win.
	it('does not read a negated word as agreement', () => {
		expect(matchBoolean('nieznakowana', ['znakowana'], ['nieznakowana'])).toBe(false);
		expect(matchBoolean('nie znakowana', ['znakowana'])).toBe(false);
	});

	it('returns null when it is neither', () => {
		expect(matchBoolean('yyy')).toBeNull();
	});

	// "nie" prefixes niebieski, niewidziana, nieznakowana... Short words must
	// match a whole token or they swallow every answer that starts with them.
	it('does not let short words prefix-match longer answers', () => {
		expect(matchBoolean('niebieski')).toBeNull();
		expect(matchBoolean('niewidziana')).toBeNull();
	});
});

describe('short-word prefixing', () => {
	it('still matches a colour that begins with a negation', () => {
		expect(matchChoice('niebieski', COLORS)).toBe('blue');
	});
});

describe('matchNumber', () => {
	it('takes words or digits inside the field range', () => {
		expect(matchNumber('trzy', 1, 50)).toBe(3);
		expect(matchNumber('12', 1, 50)).toBe(12);
	});

	it('rejects values outside the range', () => {
		expect(matchNumber('zero', 1, 50)).toBeNull();
	});

	it('takes a value described rather than counted', () => {
		expect(matchNumber('zwarty', 1, 5, { 5: ['zwart'] })).toBe(5);
	});

	// A spoken number is never a description, whatever the synonyms say.
	it('prefers a number when both could match', () => {
		expect(matchNumber('dwa, zwarty', 1, 5, { 5: ['zwart'] })).toBe(2);
	});

	it('ignores a description outside the field range', () => {
		expect(matchNumber('zwarty', 1, 4, { 5: ['zwart'] })).toBeNull();
	});
});

describe('matchMulti', () => {
	const TYPES = choicesFrom(
		[
			{ value: 'eggs', label: 'Jaja' },
			{ value: 'open', label: 'Otwarty' },
			{ value: 'capped', label: 'Kryty' },
		],
		{ open: ['larw'] },
	);
	const PHRASES = { none: ['brak', 'nie ma'], all: ['wszystk'] };

	it('takes every option named in one utterance', () => {
		expect(matchMulti('jaja, larwy i kryty', TYPES, PHRASES)).toEqual(['eggs', 'open', 'capped']);
	});

	// However they were spoken, so the read-back reads the same way every time.
	it('returns them in the order the options are declared', () => {
		expect(matchMulti('kryty i jaja', TYPES, PHRASES)).toEqual(['eggs', 'capped']);
	});

	it('names an option only once, however many of its phrases hit', () => {
		expect(matchMulti('otwarty, larwy', TYPES, PHRASES)).toEqual(['open']);
	});

	it('reads an explicit none-phrase as an empty list', () => {
		expect(matchMulti('brak', TYPES, PHRASES)).toEqual([]);
		expect(matchMulti('nie ma', TYPES, PHRASES)).toEqual([]);
	});

	it('takes them all at once', () => {
		expect(matchMulti('wszystko', TYPES, PHRASES)).toEqual(['eggs', 'open', 'capped']);
	});

	// An empty list is an answer and null is a request to repeat; a caller that
	// cannot tell them apart would record "no brood" every time it mishears.
	it('returns null rather than an empty list when nothing matched', () => {
		expect(matchMulti('yyy', TYPES, PHRASES)).toBeNull();
		expect(matchMulti('', TYPES, PHRASES)).toBeNull();
	});

	// "brak trutowego" — recording the option would be the opposite of what was
	// said, and nothing here can tell which half of the utterance was meant.
	it('refuses an utterance that names an option and denies it', () => {
		expect(matchMulti('brak kryty', TYPES, PHRASES)).toBeNull();
		expect(matchMulti('brak wszystkiego', TYPES, PHRASES)).toBeNull();
	});
});
