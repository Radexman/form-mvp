import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Avatar } from '@/app/components/ui/Avatar';
import { ChangePasswordForm } from '@/app/components/profile/ChangePasswordForm';
import { DeleteAccountDialog } from '@/app/components/profile/DeleteAccountDialog';
import { formatHiveCount } from '@/app/lib/dashboard';
import { prisma } from '@/app/lib/prisma';
import {
	currentPeriodStart,
	formatLongDate,
	formatPlanName,
	hasBillableSubscription,
	nextPeriodStart,
	planTierOf,
	PLAN_LIMITS,
	usageOf,
	usagePercent,
} from '@/app/lib/profile';

import { LockIcon, WarningIcon } from '../../components/dashboard/icons';
import { TopbarShell } from '../../components/dashboard/Topbar';

const SECTION_LABEL = 'mb-2.5 text-[11px] font-semibold tracking-[0.09em] text-muted uppercase lg:text-[10px]';
const CARD = 'rounded-[10px] border border-border bg-surface p-4 lg:p-5';
const SECTION_ICON = 'h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round]';

/**
 * The signed-in user's account: who they are, what they have, what plan they
 * are on, and the two destructive controls.
 *
 * One query, derive, render — the same shape as `/dashboard`. Dynamic for the
 * same reason too: it reads the session.
 */
export default async function ProfilePage() {
	const session = await auth();

	// The `(dashboard)` layout has already turned away anonymous requests and
	// unverified accounts; this is what narrows `user.id` for the query.
	if (!session?.user?.id) {
		redirect('/sign-in');
	}

	// Captured once so the usage lookup and the renewal date cannot land in
	// different months across a month boundary mid-render.
	const now = new Date();

	// One round trip for the whole page. `_count` on the hives rather than the
	// rows: nothing here renders an individual hive.
	const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: {
			name: true,
			email: true,
			image: true,
			createdAt: true,
			// Presence only — the hash itself must not leave the server, and only
			// whether one exists decides if the password form is offered.
			passwordHash: true,
			subscription: { select: { tier: true, status: true, stripeSubscriptionId: true } },
			apiary: { select: { name: true, location: true, _count: { select: { hives: true } } } },
			usagePeriods: {
				where: { periodStart: currentPeriodStart(now) },
				select: { pdfGenerationsUsed: true, aiReportsUsed: true },
				take: 1,
			},
		},
	});

	// A JWT outlives the row it names. The layout redirects on the same
	// condition, so reaching this means the account went away mid-request.
	if (!user) {
		redirect('/sign-in');
	}

	const tier = planTierOf(user.subscription);
	const limits = PLAN_LIMITS[tier];
	const { pdfGenerationsUsed, aiReportsUsed } = usageOf(user.usagePeriods[0]);

	const hiveCount = user.apiary?._count.hives ?? 0;
	const blocked = hasBillableSubscription(user.subscription);

	/**
	 * `passwordHash` decides this, not the provider. A Google user who later set
	 * a password through the reset flow — which that route explicitly allows —
	 * has one to change, and an `Account` lookup would wrongly hide the form.
	 */
	const hasPassword = user.passwordHash !== null;

	return (
		<>
			<TopbarShell title='Profil' />

			<div className='flex-1 p-4 lg:p-6'>
				{/* Capped and centred: these are single-column settings sections, and a
				    1440px-wide password field is a worse target, not a better one. */}
				<div className='mx-auto flex w-full max-w-2xl flex-col gap-6'>
					<section className={`${CARD} flex items-center gap-4`}>
						<Avatar
							image={user.image}
							name={user.name}
							size={56}
						/>

						<div className='flex min-w-0 flex-col gap-0.5'>
							<div className='flex flex-wrap items-center gap-2'>
								<h1 className='truncate text-[18px] font-semibold tracking-[-0.01em] text-foreground'>
									{user.name ?? 'Pszczelarz'}
								</h1>
								<span
									className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] uppercase ${
										tier === 'PREMIUM' ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-muted'
									}`}
								>
									{formatPlanName(tier)}
								</span>
							</div>

							<p className='truncate text-[13px] text-muted'>{user.email}</p>
							<p className='text-[12px] text-subtle'>Konto założone {formatLongDate(user.createdAt)}</p>
						</div>
					</section>

					<section>
						<h2 className={SECTION_LABEL}>Twoja pasieka</h2>

						<div className='grid grid-cols-2 gap-3'>
							{/* `Apiary.userId` is @unique, so a count here could only ever read
							    0 or 1. The name says more and costs the same. */}
							<Stat
								label='Pasieka'
								value={user.apiary?.name ?? 'Brak pasieki'}
								hint={user.apiary?.location ?? undefined}
								muted={!user.apiary}
							/>
							<Stat
								label='Ule'
								value={String(hiveCount)}
								hint={formatHiveCount(hiveCount)}
								muted={hiveCount === 0}
							/>
						</div>
					</section>

					<section>
						<h2 className={SECTION_LABEL}>Plan i wykorzystanie</h2>

						<div className={`${CARD} flex flex-col gap-4`}>
							<UsageBar
								label='Wygenerowane PDF-y'
								used={pdfGenerationsUsed}
								limit={limits.pdfGenerations}
							/>
							<UsageBar
								label='Raporty AI'
								used={aiReportsUsed}
								limit={limits.aiReports}
							/>

							<p className='text-[12px] text-subtle'>
								Limity planu {formatPlanName(tier)}. Liczniki zerują się {formatLongDate(nextPeriodStart(now))}.
							</p>
						</div>
					</section>

					{/* Hidden, not disabled, for an OAuth-only account: there is no current
					    password to prove, so the form has nothing to ask for. The endpoint
					    refuses it independently. */}
					{hasPassword && (
						<section>
							<h2 className={`${SECTION_LABEL} flex items-center gap-1.5`}>
								<LockIcon className={SECTION_ICON} />
								Hasło
							</h2>

							<div className={CARD}>
								<ChangePasswordForm />
							</div>
						</section>
					)}

					<section>
						<h2 className={`${SECTION_LABEL} flex items-center gap-1.5 text-danger`}>
							<WarningIcon className={SECTION_ICON} />
							Strefa zagrożenia
						</h2>

						<div className='flex flex-col gap-3 rounded-[10px] border border-danger/30 bg-danger/[0.04] p-4 lg:p-5'>
							<div>
								<h3 className='mb-1 text-[14px] font-semibold text-foreground'>Usuń konto</h3>
								<p className='text-[13px] leading-relaxed text-muted'>
									Trwale usuwa konto oraz wszystkie pasieki, ule i przeglądy. Tej operacji nie można cofnąć.
								</p>
							</div>

							{blocked ? (
								/* Only a genuinely billed subscription reaches this branch, so it
								   is unreachable until Stripe lands — see `hasBillableSubscription`. */
								<p className='rounded-md border border-accent-warm/40 bg-accent-warm/10 px-3 py-2.5 text-[12px] leading-relaxed text-accent-warm'>
									Masz aktywną subskrypcję Premium. Anuluj ją, zanim usuniesz konto.
								</p>
							) : (
								<DeleteAccountDialog
									blocked={false}
									warnPremiumForfeit={tier === 'PREMIUM'}
									summary={deletionSummary(user.apiary?.name ?? null, hiveCount)}
								/>
							)}
						</div>
					</section>
				</div>
			</div>
		</>
	);
}

/**
 * Names what goes, rather than "all your data". Someone about to type the
 * phrase should be able to recognise their own apiary in the sentence.
 */
function deletionSummary(apiaryName: string | null, hiveCount: number): string {
	if (!apiaryName) {
		return 'Twoje konto wraz ze wszystkimi danymi';
	}

	return `Twoje konto, pasiekę „${apiaryName}”, ${formatHiveCount(hiveCount)} i wszystkie przeglądy`;
}

function Stat({ label, value, hint, muted }: { label: string; value: string; hint?: string; muted?: boolean }) {
	return (
		<div className={CARD}>
			<p className='mb-1 text-[11px] font-medium tracking-[0.05em] text-muted uppercase'>{label}</p>
			<p
				className={`truncate text-[18px] font-semibold tracking-[-0.01em] ${muted ? 'text-muted' : 'text-foreground'}`}
			>
				{value}
			</p>
			{hint && <p className='mt-0.5 truncate text-[12px] text-subtle'>{hint}</p>}
		</div>
	);
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
	const percent = usagePercent(used, limit);
	// The counter can outrun the limit — a tier downgrade mid-month, or a change
	// to the working numbers — and the bar being full must not read as "fine".
	const exhausted = used >= limit;

	return (
		<div>
			<div className='mb-1.5 flex items-baseline justify-between gap-3'>
				<span className='text-[13px] text-foreground'>{label}</span>
				<span className={`font-mono text-[12px] ${exhausted ? 'text-accent-warm' : 'text-muted'}`}>
					{used} / {limit}
				</span>
			</div>

			<div
				role='progressbar'
				aria-label={label}
				aria-valuenow={used}
				aria-valuemin={0}
				aria-valuemax={limit}
				className='h-1.5 overflow-hidden rounded-full bg-surface-3'
			>
				<div
					style={{ width: `${percent}%` }}
					className={`h-full rounded-full transition-[width] ${exhausted ? 'bg-accent-warm' : 'bg-accent'}`}
				/>
			</div>
		</div>
	);
}
