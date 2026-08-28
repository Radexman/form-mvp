import { StrengthDots } from './StrengthDots';
import { ALERT_BADGE_LABELS, type AlertVariant } from './status';

/**
 * Three sides only. The left border is the status accent and is declared
 * separately per variant, so the hover tint below can lighten the hairlines
 * without ever repainting the amber or red edge.
 */
const CARD_BASE =
	'rounded-[10px] border-t border-r border-b border-t-border border-r-border border-b-border bg-surface p-4 transition-colors hover:border-t-border-2 hover:border-r-border-2 hover:border-b-border-2 lg:px-3.5 lg:py-3';

const CARD_ACCENT_EDGE: Record<AlertVariant, string> = {
	warning: 'border-l-2 border-l-accent-warm',
	danger: 'border-l-2 border-l-danger',
};

const BADGE_BASE = 'shrink-0 rounded-sm px-1.75 py-0.5 text-[11px] font-semibold tracking-[0.04em] lg:text-[10px]';

const BADGE_BY_VARIANT: Record<AlertVariant, string> = {
	warning: 'bg-accent-warm/12 text-accent-warm',
	danger: 'bg-danger/12 text-danger',
};

export interface AlertCardProps {
	hiveLabel: string;
	variant: AlertVariant;
	description: string;
	/** 1–5. */
	strength: number;
	date: string;
}

export function AlertCard({ hiveLabel, variant, description, strength, date }: AlertCardProps) {
	return (
		<article className={`${CARD_BASE} ${CARD_ACCENT_EDGE[variant]}`}>
			<div className='mb-1.5 flex items-center justify-between gap-2'>
				<span className='text-[15px] font-medium text-foreground lg:text-[13px]'>{hiveLabel}</span>
				<span className={`${BADGE_BASE} ${BADGE_BY_VARIANT[variant]}`}>{ALERT_BADGE_LABELS[variant]}</span>
			</div>

			<p className='mb-2 text-[14px] text-muted lg:text-[12px]'>{description}</p>

			<StrengthDots
				value={strength}
				variant={variant}
			/>

			<p className='mt-1.5 font-mono text-[12px] text-muted lg:text-[10px]'>{date}</p>
		</article>
	);
}
