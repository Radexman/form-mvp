import type { HiveStatus, QueenStatus } from '@/app/components/dashboard/status';
import type { HiveType } from '@/generated/prisma/client';
import type { ColonyData, HiveWithCurrentInspection, QueenData } from '@/types/inspection';

/**
 * Every derivation the dashboard performs on seeded records, as pure functions.
 *
 * The spec asks for these "in the page component, not in child components".
 * They live here instead of inline in the page for the half of that rule that
 * matters — no component derives anything — while staying unit-testable, which
 * a function nested inside a server component is not.
 *
 * `now` is a parameter everywhere it is needed rather than a `Date.now()` call
 * inside, so a test can pin the clock instead of racing it.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Past this many days without an inspection, a hive is flagged. */
const OVERDUE_DAYS = 14;

/**
 * The apiary's wall clock. Vercel runs on UTC, so without this the greeting
 * flips at the wrong hour and a late-evening inspection date lands on the
 * previous day for a beekeeper standing in a Polish field.
 */
const TIME_ZONE = 'Europe/Warsaw';

const DATE_FORMAT = new Intl.DateTimeFormat('pl-PL', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: TIME_ZONE,
});

const HOUR_FORMAT = new Intl.DateTimeFormat('pl-PL', {
	hour: '2-digit',
	// h23 rather than hour12:false — the latter renders midnight as "24" in some
	// ICU versions, which would read as the evening greeting at 00:30.
	hourCycle: 'h23',
	timeZone: TIME_ZONE,
});

export function daysSinceInspection(inspectedAt: Date, now: Date): number {
	return Math.floor((now.getTime() - inspectedAt.getTime()) / MS_PER_DAY);
}

/**
 * Never-inspected hives yield `null`, not a `QueenStatus`. "No inspection" is
 * not a queen state, so it is carried as the absence of one rather than as a
 * fourth member of the union — which every map keyed on `QueenStatus` would
 * then have to handle.
 */
export function deriveQueenStatus(hive: HiveWithCurrentInspection): QueenStatus | null {
	if (!hive.currentInspection) {
		return null;
	}

	return (hive.currentInspection.queen as QueenData).queen_status;
}

/**
 * A hive with no inspection is `'ok'` — neutral, not an alarm. The card tells
 * the two apart by `queenStatus === null`, which mutes the dot and the label;
 * `HiveStatus` deliberately stays three-valued.
 */
export function deriveHiveStatus(hive: HiveWithCurrentInspection, now: Date): HiveStatus {
	const inspection = hive.currentInspection;

	if (!inspection) {
		return 'ok';
	}

	const queen = inspection.queen as QueenData;

	if (queen.queen_status === 'missing' || queen.queen_cells === 'swarm') {
		return 'danger';
	}

	if (queen.queen_status === 'not_seen_brood_ok' || queen.queen_cells === 'emergency') {
		return 'warning';
	}

	if (daysSinceInspection(inspection.inspectedAt, now) > OVERDUE_DAYS) {
		return 'warning';
	}

	return 'ok';
}

/** Ordered to match `deriveHiveStatus`, so the reason always explains the colour. */
export function deriveAlertDescription(hive: HiveWithCurrentInspection, now: Date): string {
	const inspection = hive.currentInspection;

	if (!inspection) {
		return 'Brak przeglądów';
	}

	const queen = inspection.queen as QueenData;

	if (queen.queen_status === 'missing') return 'Brak matki · sprawdź mateczniki';
	if (queen.queen_cells === 'swarm') return 'Mateczniki rojowe · interweniuj';
	if (queen.queen_status === 'not_seen_brood_ok') return 'Matka niewidziana, czerw OK';
	if (queen.queen_cells === 'emergency') return 'Mateczniki ratunkowe';

	const days = daysSinceInspection(inspection.inspectedAt, now);

	if (days > OVERDUE_DAYS) return `Przegląd przeterminowany · ${days} dni`;

	return 'Wymaga obserwacji';
}

/** `colonyObject` validates `frames_covered` to 0–20, not the spec's 0–10. */
const MAX_FRAMES = 20;
const TOTAL_DOTS = 5;

/**
 * Frames covered onto the five dots `StrengthDots` draws. The spec says to
 * halve, which assumes a 0–10 scale the form does not enforce — under halving a
 * 12-frame colony would render identically to a 20-frame one.
 *
 * Any inspected colony gets at least one dot: zero dots is how a hive with no
 * inspection at all reads, and those two must not look the same.
 */
export function deriveStrength(hive: HiveWithCurrentInspection): number {
	if (!hive.currentInspection) {
		return 0;
	}

	const { frames_covered: frames } = hive.currentInspection.colony as ColonyData;

	if (frames <= 0) {
		return 0;
	}

	return Math.min(TOTAL_DOTS, Math.max(1, Math.round((frames / MAX_FRAMES) * TOTAL_DOTS)));
}

export function formatInspectionDate(inspectedAt: Date | null): string {
	return inspectedAt ? DATE_FORMAT.format(inspectedAt) : 'Brak przeglądu';
}

export function getGreeting(firstName: string, now: Date): string {
	const hour = Number(HOUR_FORMAT.format(now));

	// Two branches, not the spec's three: Polish has no separate midday
	// greeting, so its `hour < 12` and `hour < 18` cases return the same string.
	return hour < 18 ? `Dzień dobry, ${firstName}` : `Dobry wieczór, ${firstName}`;
}

function nameParts(name: string | null): string[] {
	return (name ?? '').trim().split(/\s+/).filter(Boolean);
}

/** "Jan Pszczelarz" → "Jan P."; a single-word name is left alone. */
export function formatShortName(name: string | null): string {
	const parts = nameParts(name);

	if (parts.length === 0) return 'Pszczelarz';
	if (parts.length === 1) return parts[0];

	return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Jan Pszczelarz" → "JP". A single name gives its first two letters. */
export function formatInitials(name: string | null): string {
	const parts = nameParts(name);

	if (parts.length === 0) return '?';

	const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];

	return letters.toUpperCase();
}

export function firstNameOf(name: string | null): string {
	return nameParts(name)[0] ?? 'Pszczelarzu';
}

const PLURAL = new Intl.PluralRules('pl-PL');

/**
 * Polish counts in three shapes — 1 ul, 2–4 ule, 5+ uli — and the verb follows
 * the same split. Hardcoding "uli" reads as broken Polish on any apiary with
 * two to four hives, which is most new ones.
 */
function hiveNoun(count: number): string {
	switch (PLURAL.select(count)) {
		case 'one':
			return 'ul';
		case 'few':
			return 'ule';
		default:
			return 'uli';
	}
}

function needsAttentionVerb(count: number): string {
	return PLURAL.select(count) === 'few' ? 'wymagają' : 'wymaga';
}

/** Adjective forms agreeing with `hiveNoun`. Eponymous types do not decline. */
const HIVE_TYPE_ADJECTIVE: Record<HiveType, { few: string; many: string }> = {
	WIELKOPOLSKI: { few: 'wielkopolskie', many: 'wielkopolskich' },
	DADANT: { few: 'Dadant', many: 'Dadant' },
	LANGSTROTH: { few: 'Langstroth', many: 'Langstroth' },
	WARRE: { few: 'Warré', many: 'Warré' },
	LAYENS: { few: 'Layens', many: 'Layens' },
	OTHER: { few: 'innego typu', many: 'innego typu' },
};

export function buildSummaryLine(totalHives: number, lastInspectionDate: Date | null, alertCount: number): string {
	const hives = `${totalHives} ${hiveNoun(totalHives)}`;
	const last = lastInspectionDate ? `ostatni przegląd ${formatInspectionDate(lastInspectionDate)}` : 'brak przeglądów';
	const alerts = `${alertCount} ${needsAttentionVerb(alertCount)} uwagi`;

	return `${hives} · ${last} · ${alerts}`;
}

/** "5 uli wielkopolskich", or one clause per type when the apiary is mixed. */
export function buildHiveTypeSummary(hiveTypes: HiveType[]): string {
	if (hiveTypes.length === 0) {
		return 'Brak uli';
	}

	const counts = new Map<HiveType, number>();

	for (const type of hiveTypes) {
		counts.set(type, (counts.get(type) ?? 0) + 1);
	}

	return [...counts.entries()]
		.sort(([, a], [, b]) => b - a)
		.map(([type, count]) => {
			const form = PLURAL.select(count) === 'few' ? 'few' : 'many';

			return `${count} ${hiveNoun(count)} ${HIVE_TYPE_ADJECTIVE[type][form]}`;
		})
		.join(' · ');
}

/** Newest `inspectedAt` across the apiary, or null when nothing is inspected. */
export function latestInspectionDate(hives: HiveWithCurrentInspection[]): Date | null {
	return hives.reduce<Date | null>((latest, hive) => {
		const date = hive.currentInspection?.inspectedAt ?? null;

		if (!date) return latest;

		return !latest || date > latest ? date : latest;
	}, null);
}
