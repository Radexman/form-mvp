import { describe, expect, it } from 'vitest';

import { normalize, ordinalPl, parseCommand, parseNumberToken } from './grammar';

const frame = (values: Record<string, number>, extra: Record<string, unknown> = {}) => ({
	kind: 'frame',
	values,
	wear: undefined,
	state: undefined,
	...extra,
});

describe('normalize', () => {
	it('strips every Polish diacritic', () => {
		expect(normalize('żółć')).toBe('zolc');
		expect(normalize('pięć')).toBe('piec');
		expect(normalize('Sześć')).toBe('szesc');
		expect(normalize('miód')).toBe('miod');
	});

	// ł is a distinct codepoint with no NFD decomposition, unlike the others.
	it('handles ł, which NFD alone would leave behind', () => {
		expect(normalize('Pyłek')).toBe('pylek');
		expect(normalize('MAŁY')).toBe('maly');
	});

	it('drops punctuation and collapses whitespace', () => {
		expect(normalize('miód 8,  pierzga 1.')).toBe('miod 8 pierzga 1');
	});
});

describe('parseNumberToken', () => {
	it('accepts number words and digits', () => {
		expect(parseNumberToken('dziesiec')).toBe(10);
		expect(parseNumberToken('8')).toBe(8);
		expect(parseNumberToken('zero')).toBe(0);
	});

	it('treats pół as half a frame', () => {
		expect(parseNumberToken('pol')).toBe(5);
	});

	it('rejects out-of-range and non-numbers', () => {
		expect(parseNumberToken('99')).toBeNull();
		expect(parseNumberToken('miod')).toBeNull();
	});
});

describe('parseCommand — the documented flow', () => {
	it('reads the slots answer as a bare number', () => {
		expect(parseCommand('dziesięć')).toEqual({ kind: 'number', value: 10 });
	});

	it('reads the example frame utterance', () => {
		expect(parseCommand('Miód 8, pierzga 1')).toEqual(frame({ honey: 8, pollen: 1 }));
	});

	it('confirms', () => {
		expect(parseCommand('dalej')).toEqual({ kind: 'next' });
	});
});

describe('parseCommand — resources', () => {
	it('takes all three in one utterance', () => {
		expect(parseCommand('czerw osiem miód jeden pierzga jeden')).toEqual(frame({ brood: 8, honey: 1, pollen: 1 }));
	});

	it('accepts either word order', () => {
		expect(parseCommand('osiem miodu')).toEqual(frame({ honey: 8 }));
	});

	// "miód" is /mjut/, and the recogniser writes it phonetically about as often
	// as it spells it. "nektar" is the reliable fallback the beekeeper can use.
	it.each([['miód'], ['miod'], ['miodu'], ['miot'], ['miut'], ['mjut'], ['nektar']])('reads "%s" as honey', (word) => {
		expect(parseCommand(`${word} 8`)).toEqual(frame({ honey: 8 }));
	});

	it('accepts inflected forms via stems', () => {
		expect(parseCommand('miodu 6 pierzgi 2 czerwiu 1')).toEqual(frame({ honey: 6, pollen: 2, brood: 1 }));
	});
});

describe('parseCommand — frame state and wear', () => {
	it('understands węza', () => {
		expect(parseCommand('węza')).toEqual(frame({}, { state: 'foundation' }));
	});

	it('understands an empty drawn frame', () => {
		expect(parseCommand('pusta')).toEqual(frame({ brood: 0, honey: 0, pollen: 0 }, { state: 'drawn' }));
	});

	it('takes wear on its own, for amending at the confirm prompt', () => {
		expect(parseCommand('stary')).toEqual(frame({}, { wear: 'old' }));
		expect(parseCommand('do wymiany')).toEqual(frame({}, { wear: 'needs_replacement' }));
	});

	it('takes content and wear together', () => {
		expect(parseCommand('miód 8 stary')).toEqual(frame({ honey: 8 }, { wear: 'old' }));
	});
});

describe('parseCommand — navigation', () => {
	it('lets stop outrank everything', () => {
		expect(parseCommand('miód 8 stop')).toEqual({ kind: 'stop' });
	});

	it('jumps by ordinal or digit', () => {
		expect(parseCommand('ramka trzecia')).toEqual({ kind: 'goto', position: 3 });
		expect(parseCommand('ramka 7')).toEqual({ kind: 'goto', position: 7 });
	});

	// "dobrze"/"dobra" also prefix-match the `dobr` wear stem. Confirmation has to
	// win, or the most natural way to say yes would strand the confirm prompt.
	it('reads the colloquial confirmations as confirmations, not as wear', () => {
		expect(parseCommand('dobrze')).toEqual({ kind: 'next' });
		expect(parseCommand('dobra')).toEqual({ kind: 'next' });
		expect(parseCommand('tak')).toEqual({ kind: 'next' });
	});

	it('still reads "dobry" as comb wear', () => {
		expect(parseCommand('dobry')).toEqual(frame({}, { wear: 'good' }));
	});

	it('ignores a trailing confirmation when content was dictated', () => {
		expect(parseCommand('miód 8 dobrze')).toEqual(frame({ honey: 8 }));
	});

	it('handles the remaining control words', () => {
		expect(parseCommand('popraw')).toEqual({ kind: 'undo' });
		expect(parseCommand('wstecz')).toEqual({ kind: 'back' });
		expect(parseCommand('powtórz')).toEqual({ kind: 'repeat' });
	});
});

describe('parseCommand — refuses to guess', () => {
	it('returns null rather than acting on noise', () => {
		expect(parseCommand('')).toBeNull();
		expect(parseCommand('yyy aaa')).toBeNull();
		expect(parseCommand('miód')).toBeNull();
	});
});

describe('ordinalPl', () => {
	it('uses feminine ordinals, since "ramka" is feminine', () => {
		expect(ordinalPl(1)).toBe('pierwsza');
		expect(ordinalPl(8)).toBe('ósma');
		expect(ordinalPl(12)).toBe('dwunasta');
	});
});
