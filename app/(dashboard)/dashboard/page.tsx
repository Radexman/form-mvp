import { AlertCard, type AlertCardProps } from '../../components/dashboard/AlertCard';
import { HiveCard, type HiveCardProps } from '../../components/dashboard/HiveCard';
import { Topbar } from '../../components/dashboard/Topbar';

/*
 * Everything below is placeholder content transcribed from the spec's mock.
 * Spec 2 replaces these constants with the seeded apiary — nothing here should
 * grow logic, because all of it is about to be deleted.
 */

const APIARY = {
	name: 'Pasieka Turawa',
	location: 'Turawa, woj. opolskie',
	beekeeper: 'Radek',
	summary: '8 uli · ostatni przegląd 10 cze 2026 · 2 wymagają uwagi',
	hiveTypeSummary: '8 uli wielkopolskich',
};

const ALERTS: AlertCardProps[] = [
	{
		hiveLabel: 'Ul 3',
		variant: 'warning',
		description: 'Matka niewidziana, czerw OK',
		strength: 3,
		date: '8 cze 2026',
	},
	{
		hiveLabel: 'Ul 4',
		variant: 'danger',
		description: 'Brak matki · mateczniki rojowe',
		strength: 2,
		date: '29 maj 2026',
	},
	{
		hiveLabel: 'Ul 8',
		variant: 'warning',
		description: 'Przegląd przeterminowany · 26 dni',
		strength: 3,
		date: '2 cze 2026',
	},
];

const HIVES: HiveCardProps[] = [
	{ number: 1, queenStatus: 'seen', strength: 4, lastInspection: '10 cze 2026', status: 'ok' },
	{ number: 2, queenStatus: 'seen', strength: 5, lastInspection: '10 cze 2026', status: 'ok' },
	{ number: 3, queenStatus: 'not_seen_brood_ok', strength: 3, lastInspection: '8 cze 2026', status: 'warning' },
	{ number: 4, queenStatus: 'missing', strength: 2, lastInspection: '29 maj 2026', status: 'danger' },
	{ number: 5, queenStatus: 'seen', strength: 5, lastInspection: '10 cze 2026', status: 'ok' },
	{ number: 6, queenStatus: 'seen', strength: 4, lastInspection: '10 cze 2026', status: 'ok' },
	{ number: 7, queenStatus: 'seen', strength: 5, lastInspection: '9 cze 2026', status: 'ok' },
	{ number: 8, queenStatus: 'not_seen_brood_ok', strength: 3, lastInspection: '2 cze 2026', status: 'warning' },
];

const SECTION_LABEL = 'mb-2.5 text-[11px] font-semibold tracking-[0.09em] text-muted uppercase lg:text-[10px]';

export default function DashboardPage() {
	return (
		<>
			<Topbar
				apiaryName={APIARY.name}
				location={APIARY.location}
			/>

			<div className='flex-1 p-4 lg:p-6'>
				<div className='mb-5 lg:mb-6'>
					<h1 className='mb-0.5 text-[22px] font-semibold tracking-[-0.02em] text-foreground lg:text-[20px]'>
						Dzień dobry, {APIARY.beekeeper}
					</h1>
					<p className='font-mono text-[13px] text-muted lg:text-[12px]'>{APIARY.summary}</p>
				</div>

				<h2 className={SECTION_LABEL}>Wymagają uwagi</h2>
				{/* One per row on phones — an alert's description is a full sentence and
				    truncating the reason a hive needs attention defeats the section. */}
				<div className='mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
					{ALERTS.map((alert) => (
						<AlertCard
							key={alert.hiveLabel}
							{...alert}
						/>
					))}
				</div>

				<h2 className={SECTION_LABEL}>Ule</h2>
				<p className='mb-4 text-[13px] text-muted lg:text-[12px]'>{APIARY.hiveTypeSummary}</p>
				{/* Two up on phones: enough hives per screen to avoid hunting, while each
				    card stays wide enough for a full-width "Przegląd". */}
				<div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-2'>
					{HIVES.map((hive) => (
						<HiveCard
							key={hive.number}
							{...hive}
						/>
					))}
				</div>
			</div>
		</>
	);
}
