import { describe, expect, it } from 'vitest';

import { choicesFrom, matchBoolean, matchChoice, matchNumber } from './choice';

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
});
