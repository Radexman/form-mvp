import { describe, expect, it } from 'vitest';

import { sentenceCase } from './useDialogueRuntime';

describe('sentenceCase — how a spoken answer is written into the transcript', () => {
	it('capitalises the first word', () => {
		expect(sentenceCase('widziana')).toBe('Widziana');
	});

	it('leaves the rest of the answer alone', () => {
		expect(sentenceCase('nie ma matki')).toBe('Nie ma matki');
	});

	it('capitalises a Polish letter the recogniser returned lower-case', () => {
		expect(sentenceCase('żadnych mateczników')).toBe('Żadnych mateczników');
	});

	it('skips leading punctuation rather than giving up on the word behind it', () => {
		expect(sentenceCase('...brak')).toBe('...Brak');
	});

	it('is a no-op on an answer that already reads as a sentence', () => {
		expect(sentenceCase('Trzy ramki')).toBe('Trzy ramki');
	});

	it('survives an empty transcript', () => {
		expect(sentenceCase('')).toBe('');
	});
});
