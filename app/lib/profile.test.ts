import { describe, expect, it } from 'vitest';

import {
	currentPeriodStart,
	DELETE_CONFIRMATION_PHRASE,
	formatLongDate,
	formatPlanName,
	hasBillableSubscription,
	isDeleteConfirmed,
	nextPeriodStart,
	planTierOf,
	PLAN_LIMITS,
	usageOf,
	usagePercent,
} from './profile';

describe('formatLongDate', () => {
	it('renders a Polish long date', () => {
		expect(formatLongDate(new Date('2026-08-28T10:00:00Z'))).toBe('28 sierpnia 2026');
	});

	it('uses Europe/Warsaw, not UTC', () => {
		// 23:30 UTC on the 27th is already 01:30 on the 28th in Warsaw (UTC+2).
		expect(formatLongDate(new Date('2026-08-27T23:30:00Z'))).toBe('28 sierpnia 2026');
	});
});

describe('planTierOf', () => {
	it('reads the tier off the subscription', () => {
		expect(planTierOf({ tier: 'PREMIUM' })).toBe('PREMIUM');
		expect(planTierOf({ tier: 'FREE' })).toBe('FREE');
	});

	it('treats a missing subscription as FREE', () => {
		expect(planTierOf(null)).toBe('FREE');
	});
});

describe('formatPlanName', () => {
	it('names both tiers', () => {
		expect(formatPlanName('PREMIUM')).toBe('Premium');
		expect(formatPlanName('FREE')).toBe('Free');
	});
});

describe('PLAN_LIMITS', () => {
	it('gives premium strictly more of everything', () => {
		expect(PLAN_LIMITS.PREMIUM.pdfGenerations).toBeGreaterThan(PLAN_LIMITS.FREE.pdfGenerations);
		expect(PLAN_LIMITS.PREMIUM.aiReports).toBeGreaterThan(PLAN_LIMITS.FREE.aiReports);
	});
});

describe('currentPeriodStart', () => {
	it('returns the first instant of the UTC month', () => {
		expect(currentPeriodStart(new Date('2026-08-17T14:22:31.500Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
	});

	it('is already exact on the first of the month', () => {
		expect(currentPeriodStart(new Date('2026-08-01T00:00:00Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
	});

	/**
	 * The bug `prisma/seed.ts` has: local getters inside `Date.UTC` would read
	 * September here, because 00:30 on 1 September in Warsaw is still 22:30 on
	 * 31 August in UTC — and the stored `periodStart` is a UTC month start.
	 */
	it('does not roll the month early for a UTC+2 wall clock', () => {
		expect(currentPeriodStart(new Date('2026-08-31T22:30:00Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
	});
});

describe('nextPeriodStart', () => {
	it('returns the following month', () => {
		expect(nextPeriodStart(new Date('2026-08-17T14:00:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
	});

	it('rolls the year over from December', () => {
		expect(nextPeriodStart(new Date('2026-12-25T09:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});
});

describe('usageOf', () => {
	it('reads both counters off the period', () => {
		expect(usageOf({ pdfGenerationsUsed: 3, aiReportsUsed: 1 })).toEqual({ pdfGenerationsUsed: 3, aiReportsUsed: 1 });
	});

	// Most accounts have no row: `/api/auth/register` never creates one.
	it('reports zero for a missing period rather than failing', () => {
		expect(usageOf(null)).toEqual({ pdfGenerationsUsed: 0, aiReportsUsed: 0 });
		expect(usageOf(undefined)).toEqual({ pdfGenerationsUsed: 0, aiReportsUsed: 0 });
	});
});

describe('usagePercent', () => {
	it('scales use against the limit', () => {
		expect(usagePercent(0, 50)).toBe(0);
		expect(usagePercent(25, 50)).toBe(50);
		expect(usagePercent(50, 50)).toBe(100);
	});

	it('rounds to a whole percent', () => {
		expect(usagePercent(1, 3)).toBe(33);
	});

	it('clamps a counter that outran its limit', () => {
		expect(usagePercent(80, 50)).toBe(100);
	});

	it('never returns a negative width', () => {
		expect(usagePercent(-5, 50)).toBe(0);
	});

	it('returns 0 rather than dividing by zero', () => {
		expect(usagePercent(3, 0)).toBe(0);
	});
});

describe('hasBillableSubscription', () => {
	it('is true only for an active subscription with a Stripe id', () => {
		expect(hasBillableSubscription({ status: 'active', stripeSubscriptionId: 'sub_123' })).toBe(true);
	});

	/**
	 * The state every Premium row is in today — the seed sets `status: 'active'`
	 * and leaves every Stripe column null. Blocking here would trap the demo
	 * account behind a cancel flow that does not exist.
	 */
	it('is false for a seeded Premium row with no Stripe id', () => {
		expect(hasBillableSubscription({ status: 'active', stripeSubscriptionId: null })).toBe(false);
	});

	it('is false for a cancelled or lapsed subscription', () => {
		expect(hasBillableSubscription({ status: 'canceled', stripeSubscriptionId: 'sub_123' })).toBe(false);
		expect(hasBillableSubscription({ status: 'past_due', stripeSubscriptionId: 'sub_123' })).toBe(false);
		expect(hasBillableSubscription({ status: null, stripeSubscriptionId: 'sub_123' })).toBe(false);
	});

	it('is false when there is no subscription at all', () => {
		expect(hasBillableSubscription(null)).toBe(false);
	});
});

describe('isDeleteConfirmed', () => {
	it('accepts the exact phrase', () => {
		expect(isDeleteConfirmed(DELETE_CONFIRMATION_PHRASE)).toBe(true);
	});

	it('tolerates surrounding whitespace from a paste or autospace', () => {
		expect(isDeleteConfirmed(`  ${DELETE_CONFIRMATION_PHRASE}\n`)).toBe(true);
	});

	// Case-sensitive on purpose: deliberate transcription is the whole point.
	it('rejects a different case', () => {
		expect(isDeleteConfirmed('deletemyaccount')).toBe(false);
		expect(isDeleteConfirmed('DELETEMYACCOUNT')).toBe(false);
	});

	it('rejects partial, padded and empty input', () => {
		expect(isDeleteConfirmed('Delete')).toBe(false);
		expect(isDeleteConfirmed('Delete My Account')).toBe(false);
		expect(isDeleteConfirmed(`${DELETE_CONFIRMATION_PHRASE}!`)).toBe(false);
		expect(isDeleteConfirmed('')).toBe(false);
		expect(isDeleteConfirmed('   ')).toBe(false);
	});
});
