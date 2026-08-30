import { describe, expect, it } from 'vitest';

import {
	buildHiveTypeSummary,
	buildSummaryLine,
	daysSinceInspection,
	deriveAlertDescription,
	deriveHiveStatus,
	deriveQueenStatus,
	deriveStrength,
	firstNameOf,
	formatHiveCount,
	formatInitials,
	formatInspectionDate,
	formatShortName,
	getGreeting,
	latestInspectionDate,
} from './dashboard';
import type { HiveWithCurrentInspection } from '@/types/inspection';

/**
 * The dashboard's derivations are the only logic Spec 2 adds, and every one of
 * them has a branch that only fires on data the seed does not contain — a
 * missing queen, swarm cells, an overdue inspection. Covering them here is what
 * makes those branches verifiable without hand-inserting inspection rows.
 */

const NOW = new Date('2026-08-28T12:00:00Z');

type Queen = {
	queen_status: 'seen' | 'not_seen_brood_ok' | 'missing';
	queen_cells: 'none' | 'emergency' | 'swarm' | 'supersedure';
};

/** A hive whose only interesting parts are the ones the derivations read. */
function hive(options: { queen?: Queen; frames?: number; daysAgo?: number } = {}): HiveWithCurrentInspection {
	const base = {
		id: 'hive-1',
		apiaryId: 'apiary-1',
		label: 'Ul 1',
		hiveType: 'WIELKOPOLSKI' as const,
		createdAt: NOW,
		updatedAt: NOW,
		currentInspectionId: null,
		currentInspection: null,
	};

	if (!options.queen) {
		return base as HiveWithCurrentInspection;
	}

	return {
		...base,
		currentInspectionId: 'inspection-1',
		currentInspection: {
			id: 'inspection-1',
			hiveId: 'hive-1',
			userId: 'user-1',
			inspectedAt: new Date(NOW.getTime() - (options.daysAgo ?? 1) * 24 * 60 * 60 * 1000),
			createdAt: NOW,
			queen: { ...options.queen, queen_marked: false, queen_marker_color: null, queen_cells_count: 0 },
			colony: { frames_covered: options.frames ?? 10, behavior: 'calm', hive_space: 'ok' },
			comb: {},
			brood: {},
			health: {},
			actions: {},
			notes: '',
			combSchemaVersion: 2,
			honeyKg: null,
			honeySufficiency: null,
			combCondition: null,
		},
	} as HiveWithCurrentInspection;
}

const healthy: Queen = { queen_status: 'seen', queen_cells: 'none' };

describe('deriveHiveStatus', () => {
	it('is ok for a recently inspected, queenright colony', () => {
		expect(deriveHiveStatus(hive({ queen: healthy }), NOW)).toBe('ok');
	});

	it('is ok — not an alarm — for a hive that has never been inspected', () => {
		expect(deriveHiveStatus(hive(), NOW)).toBe('ok');
	});

	it('is danger for a missing queen', () => {
		expect(deriveHiveStatus(hive({ queen: { queen_status: 'missing', queen_cells: 'none' } }), NOW)).toBe('danger');
	});

	it('is danger for swarm cells even with a queen present', () => {
		expect(deriveHiveStatus(hive({ queen: { queen_status: 'seen', queen_cells: 'swarm' } }), NOW)).toBe('danger');
	});

	it('is warning when the queen was not seen but brood is fine', () => {
		expect(deriveHiveStatus(hive({ queen: { queen_status: 'not_seen_brood_ok', queen_cells: 'none' } }), NOW)).toBe(
			'warning',
		);
	});

	it('is warning for emergency cells', () => {
		expect(deriveHiveStatus(hive({ queen: { queen_status: 'seen', queen_cells: 'emergency' } }), NOW)).toBe('warning');
	});

	it('is warning once an inspection is more than 14 days old', () => {
		expect(deriveHiveStatus(hive({ queen: healthy, daysAgo: 15 }), NOW)).toBe('warning');
	});

	it('is still ok at exactly 14 days — the rule is strictly greater', () => {
		expect(deriveHiveStatus(hive({ queen: healthy, daysAgo: 14 }), NOW)).toBe('ok');
	});
});

describe('deriveQueenStatus', () => {
	it('is null for a hive with no inspection, not a QueenStatus', () => {
		expect(deriveQueenStatus(hive())).toBeNull();
	});

	it('reads through the JSON column otherwise', () => {
		expect(deriveQueenStatus(hive({ queen: { queen_status: 'missing', queen_cells: 'none' } }))).toBe('missing');
	});
});

describe('deriveAlertDescription', () => {
	it('reports a missing queen ahead of the swarm cells that accompany it', () => {
		expect(deriveAlertDescription(hive({ queen: { queen_status: 'missing', queen_cells: 'swarm' } }), NOW)).toBe(
			'Brak matki · sprawdź mateczniki',
		);
	});

	it('names swarm cells when the queen is present', () => {
		expect(deriveAlertDescription(hive({ queen: { queen_status: 'seen', queen_cells: 'swarm' } }), NOW)).toBe(
			'Mateczniki rojowe · interweniuj',
		);
	});

	it('counts the days for an overdue inspection', () => {
		expect(deriveAlertDescription(hive({ queen: healthy, daysAgo: 30 }), NOW)).toBe(
			'Przegląd przeterminowany · 30 dni',
		);
	});

	it('says so when there is no inspection at all', () => {
		expect(deriveAlertDescription(hive(), NOW)).toBe('Brak przeglądów');
	});
});

describe('deriveStrength', () => {
	it('is 0 with no inspection, which renders as five empty dots', () => {
		expect(deriveStrength(hive())).toBe(0);
	});

	it('scales frames covered across the 0–20 range the form validates', () => {
		expect(deriveStrength(hive({ queen: healthy, frames: 20 }))).toBe(5);
		expect(deriveStrength(hive({ queen: healthy, frames: 16 }))).toBe(4);
		expect(deriveStrength(hive({ queen: healthy, frames: 12 }))).toBe(3);
		expect(deriveStrength(hive({ queen: healthy, frames: 8 }))).toBe(2);
	});

	it('never returns 0 for an inspected colony, so it cannot be mistaken for uninspected', () => {
		expect(deriveStrength(hive({ queen: healthy, frames: 1 }))).toBe(1);
	});

	it('does return 0 when the colony genuinely covers no frames', () => {
		expect(deriveStrength(hive({ queen: healthy, frames: 0 }))).toBe(0);
	});
});

describe('daysSinceInspection', () => {
	it('floors partial days', () => {
		expect(daysSinceInspection(new Date('2026-08-26T23:00:00Z'), NOW)).toBe(1);
	});
});

describe('formatInspectionDate', () => {
	it('formats in Polish', () => {
		expect(formatInspectionDate(new Date('2026-06-10T10:00:00Z'))).toBe('10 cze 2026');
	});

	it('has a label for no date at all', () => {
		expect(formatInspectionDate(null)).toBe('Brak przeglądu');
	});
});

describe('getGreeting', () => {
	// Times are UTC; Warsaw is UTC+2 in August.
	it('greets by day before 18:00 Warsaw time', () => {
		expect(getGreeting('Jan', new Date('2026-08-28T15:59:00Z'))).toBe('Dzień dobry, Jan');
	});

	it('switches to the evening greeting at 18:00 Warsaw time', () => {
		expect(getGreeting('Jan', new Date('2026-08-28T16:00:00Z'))).toBe('Dobry wieczór, Jan');
	});

	it('does not treat midnight as hour 24', () => {
		expect(getGreeting('Jan', new Date('2026-08-27T22:30:00Z'))).toBe('Dzień dobry, Jan');
	});
});

describe('name helpers', () => {
	it('shortens to first name plus last initial', () => {
		expect(formatShortName('Jan Pszczelarz')).toBe('Jan P.');
	});

	it('leaves a single-word name alone', () => {
		expect(formatShortName('Radek')).toBe('Radek');
	});

	it('falls back when there is no name', () => {
		expect(formatShortName(null)).toBe('Pszczelarz');
		expect(firstNameOf(null)).toBe('Pszczelarzu');
		expect(formatInitials(null)).toBe('?');
	});

	it('builds initials from the first and last parts', () => {
		expect(formatInitials('Jan Pszczelarz')).toBe('JP');
		expect(formatInitials('Radek')).toBe('RA');
	});
});

describe('buildSummaryLine', () => {
	it('uses the singular for one hive', () => {
		expect(buildSummaryLine(1, null, 1)).toBe('1 ul · brak przeglądów · 1 wymaga uwagi');
	});

	it('uses the "few" plural and its verb for two to four', () => {
		expect(buildSummaryLine(2, null, 2)).toBe('2 ule · brak przeglądów · 2 wymagają uwagi');
	});

	it('uses the genitive plural from five up', () => {
		expect(buildSummaryLine(5, null, 0)).toBe('5 uli · brak przeglądów · 0 wymaga uwagi');
	});

	it('names the newest inspection when there is one', () => {
		expect(buildSummaryLine(5, new Date('2026-06-10T10:00:00Z'), 0)).toBe(
			'5 uli · ostatni przegląd 10 cze 2026 · 0 wymaga uwagi',
		);
	});
});

describe('buildHiveTypeSummary', () => {
	it('agrees the adjective with the count', () => {
		expect(buildHiveTypeSummary(Array(5).fill('WIELKOPOLSKI'))).toBe('5 uli wielkopolskich');
		expect(buildHiveTypeSummary(Array(3).fill('WIELKOPOLSKI'))).toBe('3 ule wielkopolskie');
	});

	it('lists mixed apiaries most-common first', () => {
		expect(buildHiveTypeSummary(['DADANT', 'WIELKOPOLSKI', 'WIELKOPOLSKI', 'WIELKOPOLSKI', 'WIELKOPOLSKI'])).toBe(
			'4 ule wielkopolskie · 1 ul Dadant',
		);
	});

	it('handles an apiary with no hives', () => {
		expect(buildHiveTypeSummary([])).toBe('Brak uli');
	});
});

describe('latestInspectionDate', () => {
	it('is null when nothing has been inspected', () => {
		expect(latestInspectionDate([hive(), hive()])).toBeNull();
	});

	it('picks the newest across the apiary, ignoring uninspected hives', () => {
		const newest = latestInspectionDate([
			hive({ queen: healthy, daysAgo: 10 }),
			hive(),
			hive({ queen: healthy, daysAgo: 2 }),
		]);

		expect(newest).toEqual(new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000));
	});
});

describe('formatHiveCount', () => {
	it('follows the three Polish plural shapes', () => {
		expect(formatHiveCount(1)).toBe('1 ul');
		expect(formatHiveCount(3)).toBe('3 ule');
		expect(formatHiveCount(5)).toBe('5 uli');
	});

	it('uses the many form for zero', () => {
		expect(formatHiveCount(0)).toBe('0 uli');
	});

	// 22 is "few" in Polish while 12 is not — the rule is not a simple 2-4 test.
	it('handles the teens and the twenties correctly', () => {
		expect(formatHiveCount(12)).toBe('12 uli');
		expect(formatHiveCount(22)).toBe('22 ule');
	});
});
