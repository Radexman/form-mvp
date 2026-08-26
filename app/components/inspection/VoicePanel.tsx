'use client';

import { useEffect, useRef } from 'react';

import type { DialogueTurn } from '../../lib/voice/useDialogueRuntime';

/**
 * The shared voice surface: a start/stop control and the conversation so far.
 * Every step that gains voice reuses this, so the transcript, the icons and the
 * unsupported-browser message stay identical across the form.
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
	// Keep the newest turn in view, the way a chat thread does.
	const logRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = logRef.current;
		if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
	}, [log.length]);

	if (!supported) return <p className='text-xs text-subtle'>{unsupportedNote}</p>;

	return (
		<div className='flex flex-col gap-3 rounded-lg border border-border bg-surface-2/50 p-4'>
			<div className='flex items-start justify-between gap-3'>
				<div className='flex min-w-0 flex-col gap-0.5'>
					<span className='flex items-center gap-2 text-sm font-semibold text-foreground'>
						<MicIcon className='h-4 w-4 text-muted' />
						{title}
					</span>
					<span className='text-xs text-subtle'>{hint}</span>
				</div>
				{running ? (
					<button
						type='button'
						onClick={onStop}
						className='flex min-h-14 shrink-0 items-center gap-2 rounded-lg border border-danger bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20'
					>
						<StopIcon className='h-4 w-4' />
						Stop
					</button>
				) : (
					<button
						type='button'
						onClick={onStart}
						className='flex min-h-14 shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-dim hover:text-foreground'
					>
						<MicIcon />
						Mów
					</button>
				)}
			</div>

			{(log.length > 0 || running) && (
				<div
					ref={logRef}
					className='flex max-h-80 flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-surface p-3'
				>
					{log.map((turn, position) => (
						<div
							key={`${position}-${turn.text}`}
							className={`flex ${turn.role === 'you' ? 'justify-end' : 'justify-start'}`}
						>
							<p
								className={`max-w-[85%] px-4 py-2.5 text-base leading-snug text-foreground ${
									turn.role === 'you'
										? 'rounded-2xl rounded-br-md bg-accent/15 ring-1 ring-accent/30'
										: 'rounded-2xl rounded-bl-md bg-surface-3'
								}`}
							>
								{turn.text}
							</p>
						</div>
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
			)}

			{error && <p className='text-sm text-danger'>{error}</p>}
		</div>
	);
}
