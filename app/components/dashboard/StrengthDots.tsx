import type { HiveStatus } from './status';

const TOTAL_DOTS = 5;

/**
 * Filled dots take the card's status colour rather than a fixed green, so the
 * strength read and the border/badge read never contradict each other.
 */
const FILLED_BY_STATUS: Record<HiveStatus, string> = {
	ok: 'bg-accent border-accent',
	warning: 'bg-accent-warm border-accent-warm',
	danger: 'bg-danger border-danger',
};

interface StrengthDotsProps {
	/** 1–5. Values outside the range are clamped rather than overflowing the row. */
	value: number;
	variant: HiveStatus;
}

export function StrengthDots({ value, variant }: StrengthDotsProps) {
	const filled = Math.max(0, Math.min(TOTAL_DOTS, Math.round(value)));

	return (
		<div
			className='flex items-center gap-1 lg:gap-0.75'
			role='img'
			aria-label={`Siła rodziny ${filled} z ${TOTAL_DOTS}`}
		>
			{/* 11px on phones, the mock's 9px from lg — an unfilled outline dot at 9px
			    is close to invisible in daylight on a phone screen. */}
			{Array.from({ length: TOTAL_DOTS }, (_, index) => (
				<span
					key={index}
					aria-hidden='true'
					className={`h-2.75 w-2.75 rounded-full border lg:h-2.25 lg:w-2.25 ${
						index < filled ? FILLED_BY_STATUS[variant] : 'border-subtle'
					}`}
				/>
			))}
		</div>
	);
}
