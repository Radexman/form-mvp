import type { PlanTier } from '@/generated/prisma/client';

/**
 * Everything `/profile` derives, as pure functions with `now` injected — the
 * same shape as `dashboard.ts`, and for the same reason: a function nested
 * inside a server component cannot be unit-tested, and most of these branches
 * fire on data the seed does not contain.
 */

const TIME_ZONE = 'Europe/Warsaw';

/**
 * Longer than the dashboard's `d MMM yyyy`. A join date is read once, in prose,
 * so the abbreviation buys nothing.
 */
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('pl-PL', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: TIME_ZONE,
});

export function formatLongDate(date: Date): string {
	return LONG_DATE_FORMAT.format(date);
}

export interface PlanLimits {
	pdfGenerations: number;
	aiReports: number;
}

/**
 * Working numbers from `context/project-overview.md`, which is explicit that
 * pricing is not locked in and that the limits are configuration rather than
 * something baked into logic. One place to change them, and nothing reads them
 * from the database.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
	FREE: { pdfGenerations: 15, aiReports: 5 },
	PREMIUM: { pdfGenerations: 50, aiReports: 25 },
};

/** No `Subscription` row at all reads as FREE, matching the dashboard shell. */
export function planTierOf(subscription: { tier: PlanTier } | null): PlanTier {
	return subscription?.tier ?? 'FREE';
}

export function formatPlanName(tier: PlanTier): string {
	return tier === 'PREMIUM' ? 'Premium' : 'Free';
}

/**
 * First instant of the current usage month, in UTC.
 *
 * UTC getters, not local ones: `prisma/seed.ts` builds `periodStart` from local
 * getters inside `Date.UTC`, so in UTC+2 a seed run between 00:00 and 02:00 on
 * the 1st writes the new month while `now` is still the previous one in UTC.
 * Harmless for a demo seed, but this function is what a usage row is looked up
 * by — an hour of the year where the query silently misses is not acceptable.
 */
export function currentPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** When the counters go back to zero. `month + 1` rolls the year on its own. */
export function nextPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * A missing usage row means nothing has been used this month, not an error:
 * `/api/auth/register` creates no `UsagePeriod`, so most accounts have none
 * until the first PDF is generated.
 */
export function usageOf(period: { pdfGenerationsUsed: number; aiReportsUsed: number } | null | undefined) {
	return {
		pdfGenerationsUsed: period?.pdfGenerationsUsed ?? 0,
		aiReportsUsed: period?.aiReportsUsed ?? 0,
	};
}

/**
 * Width of a usage bar. Clamped at both ends because a counter can outrun its
 * limit — the tier can be downgraded mid-month, and the working numbers above
 * are expected to move.
 */
export function usagePercent(used: number, limit: number): number {
	if (limit <= 0) {
		return 0;
	}

	return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

export interface BillableSubscription {
	status: string | null;
	stripeSubscriptionId: string | null;
}

/**
 * Whether the account is carrying a subscription that is actually being billed,
 * which is the one thing that blocks self-deletion.
 *
 * Deliberately not `tier === 'PREMIUM'`. Stripe is Phase 4: no row has a
 * `stripeSubscriptionId` today and `PREMIUM` is only ever set by the seed and
 * `create-account.ts`, so blocking on the tier would permanently trap the demo
 * account — and every other Premium user — behind a "cancel your subscription
 * first" message with no cancel flow to reach. This predicate is a no-op until
 * billing lands and starts biting the moment it does.
 */
export function hasBillableSubscription(subscription: BillableSubscription | null): boolean {
	return subscription?.status === 'active' && subscription.stripeSubscriptionId !== null;
}

/**
 * Typed verbatim to arm the delete button. Shared by the dialog and the route
 * handler, which re-checks it — the endpoint is reachable without ever opening
 * the dialog.
 */
export const DELETE_CONFIRMATION_PHRASE = 'DeleteMyAccount';

/**
 * Case-sensitive: the point of the phrase is deliberate transcription, and
 * accepting `deletemyaccount` gives that up. Surrounding whitespace is trimmed
 * because a trailing space from a paste or a mobile keyboard's autospace is not
 * a sign of accident.
 */
export function isDeleteConfirmed(value: string): boolean {
	return value.trim() === DELETE_CONFIRMATION_PHRASE;
}
