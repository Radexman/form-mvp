/**
 * The three-way health signal every dashboard surface is tinted by. Kept in one
 * place so a hive card, its strength dots and the alert that points at it can
 * never disagree about which colour a hive is.
 *
 * Spec 2 replaces the hardcoded page data with seeded records; these types and
 * the label maps below are the contract that swap has to satisfy, so nothing
 * here reaches for a database.
 */
export type HiveStatus = 'ok' | 'warning' | 'danger';

/** Alerts only ever exist for hives that need attention, so 'ok' is excluded. */
export type AlertVariant = Exclude<HiveStatus, 'ok'>;

export type QueenStatus = 'seen' | 'not_seen_brood_ok' | 'missing';

export const QUEEN_LABELS: Record<QueenStatus, string> = {
	seen: 'Matka widziana',
	not_seen_brood_ok: 'Niewidziana, OK',
	missing: 'Brak matki',
};

export const ALERT_BADGE_LABELS: Record<AlertVariant, string> = {
	warning: 'Uwaga',
	danger: 'Alarm',
};
