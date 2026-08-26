'use client';

import { useEffect, useRef, useState } from 'react';

import type { DialogueTurn } from '../../lib/voice/useDialogueRuntime';

/**
 * The voice surface: a launcher in the form, and — once talking — a bar docked
 * to the bottom of the page holding the conversation.
 *
 * Docked rather than overlaid: no scrim, no blur, full bleed, and its contents
 * share the page's own max-width and gutters so the bubbles line up with the
 * form above them. It reads as part of the layout rather than something covering
 * it, and the form stays usable while it is open.
 *
 * Mobile is the target: bottom edge for one-handed reach, dynamic viewport units
 * so browser chrome cannot clip it, and padding for the home indicator.
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

function ChevronIcon({ up }: { up: boolean }) {
	return (
		<svg
			className='h-4 w-4'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'
		>
			<path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
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
	open,
	onDismiss,
	summary,
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
	/** Whether the conversation bar is showing; the form pads itself to match. */
	open: boolean;
	onDismiss: () => void;
	/** What has been captured so far — the same words the read-back speaks. */
	summary?: string | null;
}) {
	// Whether the conversation fills the screen. Purely how the bar is displayed,
	// so it stays here rather than being lifted with `open`.
	const [expanded, setExpanded] = useState(false);

	// Keep the newest turn in view, the way a chat thread does.
	const logRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = logRef.current;
		if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
	}, [log.length, running, expanded]);

	if (!supported) return <p className='text-xs text-subtle'>{unsupportedNote}</p>;

	const close = () => (running ? onStop() : onDismiss());

	return (
		<>
			{/* Launcher. Full width on a phone so it is hard to miss with gloves. */}
			<button
				type='button'
				onClick={onStart}
				disabled={running}
				className='flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-base font-semibold text-background transition-colors hover:bg-accent-dim hover:text-foreground disabled:opacity-40 sm:w-auto sm:self-start'
			>
				<MicIcon />
				{running ? 'Słucham…' : title}
			</button>

			{open && (
				<section
					aria-label='Rozmowa'
					className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface ${expanded ? 'top-0' : ''}`}
				>
					{/* Same max-width and gutters as the page, so the bar is full bleed
					    but its contents line up with the form above it. */}
					<div className={`mx-auto flex w-full max-w-6xl flex-col px-4 ${expanded ? 'h-full' : ''}`}>
						<header className='flex items-center justify-between gap-3 py-2.5'>
							<div className='flex min-w-0 flex-col'>
								<span className='flex items-center gap-2 text-sm font-semibold text-foreground'>
									<MicIcon className='h-4 w-4 text-muted' />
									{title}
								</span>
								{/* The captured answers when there are any, the vocabulary
								    hint until then. */}
								<span className={`truncate text-xs ${summary ? 'text-muted' : 'text-subtle'}`}>{summary || hint}</span>
							</div>
							<button
								type='button'
								onClick={() => setExpanded((current) => !current)}
								aria-expanded={expanded}
								className='flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-foreground'
							>
								<ChevronIcon up={!expanded} />
								<span className='sr-only'>{expanded ? 'Zwiń rozmowę' : 'Rozwiń rozmowę'}</span>
							</button>
							<button
								type='button'
								onClick={close}
								className='flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-foreground'
							>
								<StopIcon className='h-4 w-4' />
								{running ? 'Stop' : 'Zamknij'}
							</button>
						</header>

						<div
							ref={logRef}
							className={`flex flex-col gap-2.5 overflow-y-auto border-t border-border/60 py-3 ${expanded ? 'min-h-0 flex-1' : 'max-h-[40dvh]'}`}
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

						{error && <p className='pb-1 text-sm text-danger'>{error}</p>}

						{/* Clears the home indicator on a phone. */}
						<div className='h-[max(0.25rem,env(safe-area-inset-bottom))]' />
					</div>
				</section>
			)}
		</>
	);
}
