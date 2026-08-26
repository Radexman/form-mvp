'use client';

import { useEffect, useRef, useState } from 'react';

import type { DialogueTurn } from '../../lib/voice/useDialogueRuntime';

/**
 * The voice surface: a launcher pinned above the thumb, and — once running — a
 * bottom sheet holding the conversation.
 *
 * Mobile is the target, so the sheet is docked to the bottom edge where a
 * one-handed grip can reach it, sized in dynamic viewport units so the on-screen
 * keyboard and browser chrome do not clip it, and padded for the home
 * indicator. On a wide screen it centres and stops growing.
 */

function MicIcon({ className = 'h-5 w-5' }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='1.75'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'
		>
			<rect
				x='9'
				y='2'
				width='6'
				height='11'
				rx='3'
			/>
			<path d='M5 10a7 7 0 0 0 14 0' />
			<path d='M12 17v5' />
		</svg>
	);
}

function StopIcon({ className = 'h-5 w-5' }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox='0 0 24 24'
			fill='currentColor'
			aria-hidden='true'
		>
			<rect
				x='6.5'
				y='6.5'
				width='11'
				height='11'
				rx='2.5'
			/>
		</svg>
	);
}

/** Chat-style waiting indicator, on the side the next message will land. */
function Listening() {
	return (
		<span
			className='flex items-center gap-1.5 py-1'
			role='status'
			aria-label='Słucham'
		>
			{[0, 1, 2].map((dot) => (
				<span
					key={dot}
					className='h-2 w-2 animate-pulse rounded-full bg-accent'
					style={{ animationDelay: `${dot * 160}ms`, animationDuration: '1.1s' }}
				/>
			))}
		</span>
	);
}

function Bubble({ turn }: { turn: DialogueTurn }) {
	const mine = turn.role === 'you';
	return (
		<div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
			<p
				className={`max-w-[85%] px-4 py-2.5 text-base leading-snug text-foreground ${
					mine
						? 'rounded-2xl rounded-br-md bg-accent/15 ring-1 ring-accent/30'
						: 'rounded-2xl rounded-bl-md bg-surface-3'
				}`}
			>
				{turn.text}
			</p>
		</div>
	);
}

export function VoicePanel({
	title,
	hint,
	supported,
	running,
	log,
	error,
	onStart,
	onStop,
	unsupportedNote,
}: {
	title: string;
	hint: string;
	supported: boolean;
	running: boolean;
	log: DialogueTurn[];
	error: string | null;
	onStart: () => void;
	onStop: () => void;
	unsupportedNote: string;
}) {
	// A finished transcript can be dismissed without stopping anything; starting
	// a new run brings the sheet back.
	const [dismissed, setDismissed] = useState(false);

	// Keep the newest turn in view, the way a chat thread does.
	const logRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = logRef.current;
		if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
	}, [log.length, running]);

	if (!supported) return <p className='text-xs text-subtle'>{unsupportedNote}</p>;

	const open = running || (log.length > 0 && !dismissed);
	const close = () => (running ? onStop() : setDismissed(true));

	return (
		<>
			{/* Launcher. Full width on a phone so it is hard to miss with gloves. */}
			<button
				type='button'
				onClick={() => {
					setDismissed(false);
					onStart();
				}}
				disabled={running}
				className='flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-base font-semibold text-background transition-colors hover:bg-accent-dim hover:text-foreground disabled:opacity-40 sm:w-auto sm:self-start'
			>
				<MicIcon />
				{running ? 'Słucham…' : title}
			</button>

			{open && (
				<>
					{/* Scrim only while listening — a finished transcript stays readable
					    with the form still usable behind it. */}
					{running && (
						<div
							className='fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px]'
							aria-hidden='true'
							onClick={close}
						/>
					)}

					<section
						aria-label='Rozmowa'
						className='fixed inset-x-0 bottom-0 z-50 flex max-h-[70dvh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-[0_-8px_32px_rgba(0,0,0,0.45)] sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2'
					>
						{/* Grab handle: reads as a sheet, and widens the tap target. */}
						<div className='flex shrink-0 justify-center pb-1 pt-2'>
							<span className='h-1 w-10 rounded-full bg-border' />
						</div>

						<header className='flex shrink-0 items-center justify-between gap-3 px-4 pb-3'>
							<div className='flex min-w-0 flex-col'>
								<span className='flex items-center gap-2 text-sm font-semibold text-foreground'>
									<MicIcon className='h-4 w-4 text-muted' />
									{title}
								</span>
								<span className='truncate text-xs text-subtle'>{hint}</span>
							</div>
							<button
								type='button'
								onClick={close}
								className='flex min-h-12 shrink-0 items-center gap-2 rounded-lg border border-danger bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/20'
							>
								<StopIcon className='h-4 w-4' />
								{running ? 'Stop' : 'Zamknij'}
							</button>
						</header>

						<div
							ref={logRef}
							className='flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-2'
						>
							{log.map((turn, position) => (
								<Bubble
									key={`${position}-${turn.text}`}
									turn={turn}
								/>
							))}
							{/* Waiting on the beekeeper, so it sits where their reply will. */}
							{running && (
								<div className='flex justify-end'>
									<span className='rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 ring-1 ring-accent/30'>
										<Listening />
									</span>
								</div>
							)}
						</div>

						{error && <p className='shrink-0 px-4 pt-1 text-sm text-danger'>{error}</p>}

						{/* Clears the home indicator on a phone. */}
						<div className='h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0' />
					</section>
				</>
			)}
		</>
	);
}
