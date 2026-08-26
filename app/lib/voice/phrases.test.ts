import { describe, expect, it } from 'vitest';

import type { FrameValues } from '../../components/inspection/steps/comb/comb.schema';
import { announceFrame, overflowWarning, readBack } from './phrases';

const frame = (position: number, overrides: Partial<FrameValues> = {}): FrameValues => ({
	position,
	comb_state: 'drawn',
	brood: 0,
	honey: 0,
	pollen: 0,
	wear: 'good',
	...overrides,
});

describe('announceFrame', () => {
	it('uses the feminine ordinal', () => {
		expect(announceFrame(1)).toBe('Ramka pierwsza');
		expect(announceFrame(8)).toBe('Ramka ósma');
	});
});

describe('readBack', () => {
	it('reads the example frame, deriving the empty remainder', () => {
		expect(readBack(frame(1, { honey: 8, pollen: 1 }), 1)).toBe(
			'Ramka pierwsza: miód 80 procent, pierzga 10 procent, puste 10 procent, plaster dobry. Przejść do kolejnej ramki?',
		);
	});

	it('omits the remainder when the frame is full', () => {
		expect(readBack(frame(3, { brood: 8, honey: 1, pollen: 1 }), 3)).toBe(
			'Ramka trzecia: czerw 80 procent, miód 10 procent, pierzga 10 procent, plaster dobry. Przejść do kolejnej ramki?',
		);
	});

	it('says nothing but węza for foundation', () => {
		expect(readBack(frame(8, { comb_state: 'foundation', wear: null }), 8)).toBe(
			'Ramka ósma: węza. Przejść do kolejnej ramki?',
		);
	});

	it('reads a drawn but empty frame as fully empty', () => {
		expect(readBack(frame(2), 2)).toBe('Ramka druga: puste 100 procent, plaster dobry. Przejść do kolejnej ramki?');
	});

	it('reports worn comb', () => {
		expect(readBack(frame(7, { honey: 4, pollen: 2, wear: 'old' }), 7)).toBe(
			'Ramka siódma: miód 40 procent, pierzga 20 procent, puste 40 procent, plaster stary. Przejść do kolejnej ramki?',
		);
	});
});

describe('overflowWarning', () => {
	it('states the total in the same percent units as the readback', () => {
		expect(overflowWarning(13)).toBe('To razem 130 procent, czyli więcej niż cała ramka. Powtórz proszę.');
	});
});
