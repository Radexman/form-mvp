'use client';

import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { NumberField } from '../../fields';
import type { FormValues } from '../../schema';
import { deriveComb, formatPl, frameFilled } from './comb.derive';
import {
	COMB_CONDITION_OPTIONS,
	COMB_STATE_OPTIONS,
	FRAME_RESOURCES,
	FRAME_TENTHS,
	MAX_SLOTS,
	makeFrame,
	type CombCondition,
	type CombState,
	type FrameResource,
	type FrameType,
	type FrameValues,
} from './comb.schema';

const RESOURCE_COLOR: Record<FrameResource, string> = {
	brood: 'var(--comb-brood)',
	honey: 'var(--comb-honey)',
	pollen: 'var(--comb-pollen)',
};

/** Common shapes, so the usual frame is one tap rather than six. */
const PRESETS: { label: string; values: Pick<FrameValues, 'brood' | 'honey' | 'pollen'> }[] = [
	{ label: 'Pusta', values: { brood: 0, honey: 0, pollen: 0 } },
	{ label: 'Czerwiowa', values: { brood: 8, honey: 1, pollen: 1 } },
	{ label: 'Miodowa', values: { brood: 0, honey: 8, pollen: 1 } },
	{ label: 'Pierzgowa', values: { brood: 1, honey: 2, pollen: 6 } },
];

/** The frame drawn as ten cells — the same unit it is recorded in. */
function FrameFill({ frame, className = 'h-10' }: { frame: FrameValues; className?: string }) {
	if (frame.comb_state === 'foundation') {
		return <div className={`${className} w-full rounded border border-dashed border-subtle bg-surface-3/30`} />;
	}

	const cells: (FrameResource | null)[] = [];
	for (const { key } of FRAME_RESOURCES) {
		for (let i = 0; i < frame[key]; i += 1) cells.push(key);
	}
	while (cells.length < FRAME_TENTHS) cells.push(null);

	return (
		<div className={`${className} flex w-full gap-px overflow-hidden rounded`}>
			{cells.slice(0, FRAME_TENTHS).map((resource, cell) => (
				<span
					key={cell}
					className='flex-1'
					style={{ background: resource ? RESOURCE_COLOR[resource] : 'var(--comb-empty)' }}
				/>
			))}
		</div>
	);
}

function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T | null;
	options: { value: string; label: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className='flex flex-col gap-2'>
			<span className='text-sm text-muted'>{label}</span>
			<div
				className='grid gap-2'
				style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
			>
				{options.map((option) => {
					const selected = option.value === value;
					return (
						<button
							key={option.value}
							type='button'
							aria-pressed={selected}
							onClick={() => onChange(option.value as T)}
							className={`min-h-14 rounded-lg border px-2 py-3 text-sm font-medium transition-colors ${
								selected
									? 'border-accent bg-accent/10 text-foreground ring-1 ring-accent'
									: 'border-border bg-surface-2 text-muted hover:border-subtle'
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/**
 * One resource, in tenths, shown as the percentage the beekeeper actually says
 * out loud. `max` is what is left of the frame, so the sum can never overflow.
 */
function TenthsRow({
	label,
	color,
	value,
	max,
	onChange,
}: {
	label: string;
	color: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
}) {
	const stepClass =
		'h-14 w-14 shrink-0 rounded-lg border border-border bg-surface-2 text-2xl leading-none text-foreground transition-colors hover:bg-surface-3 disabled:opacity-25';
	const active = value > 0;

	return (
		<div
			className='flex items-center gap-3 rounded-lg border-l-4 py-1.5 pl-2 transition-colors'
			style={{
				borderLeftColor: active ? color : 'var(--border)',
				background: active ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
			}}
		>
			<span className='flex w-24 shrink-0 items-center gap-2 text-sm text-foreground'>
				<span
					className='h-3.5 w-3.5 shrink-0 rounded-full'
					style={{ background: color }}
				/>
				{label}
			</span>
			<button
				type='button'
				aria-label={`${label} mniej`}
				onClick={() => onChange(value - 1)}
				disabled={value <= 0}
				className={stepClass}
			>
				−
			</button>
			<span
				className='flex-1 text-center font-mono text-2xl transition-colors'
				style={{ color: active ? color : 'var(--subtle)' }}
			>
				{value * 10}%
			</span>
			<button
				type='button'
				aria-label={`${label} więcej`}
				onClick={() => onChange(value + 1)}
				disabled={value >= max}
				className={stepClass}
			>
				+
			</button>
		</div>
	);
}

/**
 * Values stay in the foreground colour — the resource hues are too dark (brood)
 * or too washed (empty grey) to carry text on this background, so the accent is
 * kept to the rule and the dot.
 */
function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent: string }) {
	return (
		<div
			className='flex flex-col gap-0.5 rounded-lg border border-l-4 border-border bg-surface-2 p-3'
			style={{ borderLeftColor: accent }}
		>
			<span className='flex items-center gap-1.5 text-xs uppercase tracking-wide text-subtle'>
				<span
					className='h-2 w-2 shrink-0 rounded-full'
					style={{ background: accent }}
				/>
				{label}
			</span>
			<span className='font-mono text-xl text-foreground'>{value}</span>
			{hint && <span className='text-xs text-muted'>{hint}</span>}
		</div>
	);
}

export function StepComb() {
	const {
		control,
		setValue,
		getValues,
		formState: { errors },
	} = useFormContext<FormValues>();
	const [active, setActive] = useState(0);

	const frames = (useWatch({ control, name: 'frames' }) ?? []) as FrameValues[];
	const slots = (useWatch({ control, name: 'slots' }) ?? 0) as number;
	const frameType = (useWatch({ control, name: 'frame_type' }) ?? 'wielkopolska') as FrameType;

	const index = Math.min(active, Math.max(frames.length - 1, 0));
	const frame = frames[index];

	const derived = deriveComb({ frame_type: frameType, slots, low_confidence: false, frames });

	/**
	 * Array order is the box, left to right, so `position` is always derived from
	 * it — renumbering here keeps the chips, the header and the payload agreeing
	 * after a frame is moved, added or removed.
	 */
	const setFrames = (next: FrameValues[]) =>
		setValue(
			'frames',
			next.map((item, position) => ({ ...item, position: position + 1 })),
			{ shouldDirty: true },
		);

	const update = (patch: Partial<FrameValues>) => {
		if (!frame) return;
		setFrames(frames.map((item, i) => (i === index ? { ...item, ...patch } : item)));
	};

	/** Slots is the box; the frame list follows it, growing and truncating from the end. */
	const syncSlots = (next: number) => {
		if (!Number.isInteger(next) || next < 1 || next > MAX_SLOTS) return;
		const current = (getValues('frames') ?? []) as FrameValues[];
		if (next === current.length) return;
		const resized =
			next < current.length
				? current.slice(0, next)
				: [
						...current,
						...Array.from({ length: next - current.length }, (_, offset) =>
							makeFrame(current.length + offset + 1),
						),
					];
		setFrames(resized);
		setActive((position) => Math.min(position, resized.length - 1));
	};

	const setFrameState = (state: CombState) => {
		if (state === 'foundation') {
			update({ comb_state: 'foundation', brood: 0, honey: 0, pollen: 0, wear: null });
		} else {
			update({ comb_state: 'drawn', wear: frame?.wear ?? 'good' });
		}
	};

	/**
	 * Swap with the neighbour and follow the frame, so what the payload records is
	 * the arrangement the hive is left in — not the one it was opened in.
	 */
	const moveFrame = (offset: -1 | 1) => {
		const target = index + offset;
		if (target < 0 || target >= frames.length) return;
		const next = [...frames];
		[next[index], next[target]] = [next[target], next[index]];
		setFrames(next);
		setActive(target);
	};

	const addFrame = () => {
		const next = [...frames, makeFrame(frames.length + 1)];
		setFrames(next);
		setActive(next.length - 1);
	};

	const removeLastFrame = () => {
		if (frames.length <= 1) return;
		const next = frames.slice(0, -1);
		setFrames(next);
		setActive((position) => Math.min(position, next.length - 1));
	};

	const frameErrors = errors.frames as
		| ({ message?: string; root?: { message?: string } } & Record<number, Record<string, { message?: string }>>)
		| undefined;
	const listError = frameErrors?.message ?? frameErrors?.root?.message;
	const activeErrors = Object.values(frameErrors?.[index] ?? {})
		.map((entry) => entry?.message)
		.filter(Boolean);

	const filled = frame ? frameFilled(frame) : 0;
	const isDrawn = frame?.comb_state === 'drawn';

	return (
		<div className='flex flex-col gap-6'>
			<p className='text-sm text-subtle'>
				Ramka po ramce, w dziesiątych częściach. Kilogramy miodu i zapasy policzy raport — tu wpisujesz tylko
				to, co widzisz.
			</p>

			<div className='sm:max-w-xs'>
				<NumberField
					name='slots'
					label='Miejsc w ulu (gniazdo)'
					min={1}
					max={MAX_SLOTS}
					onValueChange={syncSlots}
				/>
			</div>

			{/* Frame picker — each chip shows its own composition, so gaps are visible at a glance. */}
			<div className='flex flex-col gap-2'>
				<div className='flex items-center justify-between'>
					<span className='text-sm text-muted'>
						Ramki: {frames.length} z {slots} miejsc
					</span>
					<div className='flex gap-2'>
						<button
							type='button'
							onClick={removeLastFrame}
							disabled={frames.length <= 1}
							className='rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-3 disabled:opacity-30'
						>
							− Usuń ostatnią
						</button>
						<button
							type='button'
							onClick={addFrame}
							disabled={frames.length >= slots || frames.length >= MAX_SLOTS}
							className='rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-3 disabled:opacity-30'
						>
							+ Dodaj ramkę
						</button>
					</div>
				</div>
				<div className='flex gap-1.5 overflow-x-auto pb-1'>
					{frames.map((item, position) => (
						<button
							key={item.position}
							type='button'
							onClick={() => setActive(position)}
							aria-current={position === index}
							className={`flex w-11 shrink-0 flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2 transition-colors ${
								position === index
									? 'border-accent bg-accent/10 ring-1 ring-accent'
									: 'border-border bg-surface-2 hover:border-subtle'
							}`}
						>
							<span
								className={`font-mono text-xs ${position === index ? 'text-foreground' : 'text-muted'}`}
							>
								{item.position}
							</span>
							<FrameFill
								frame={item}
								className='h-8'
							/>
						</button>
					))}
				</div>
			</div>

			{listError && <p className='text-sm text-danger'>{listError}</p>}

			{frame && (
				<div className='flex flex-col gap-5 rounded-lg border border-border bg-surface-2/50 p-4'>
					<div className='flex items-center justify-between'>
						<h3 className='text-base font-semibold text-foreground'>
							Ramka {frame.position}{' '}
							<span className='text-sm font-normal text-subtle'>z {frames.length}</span>
						</h3>
						<div className='flex gap-2'>
							<button
								type='button'
								onClick={() => setActive(index - 1)}
								disabled={index <= 0}
								className='h-11 w-11 rounded-lg border border-border bg-surface text-lg text-foreground transition-colors hover:bg-surface-3 disabled:opacity-30'
								aria-label='Poprzednia ramka'
							>
								←
							</button>
							<button
								type='button'
								onClick={() => setActive(index + 1)}
								disabled={index >= frames.length - 1}
								className='h-11 w-11 rounded-lg border border-border bg-surface text-lg text-foreground transition-colors hover:bg-surface-3 disabled:opacity-30'
								aria-label='Następna ramka'
							>
								→
							</button>
						</div>
					</div>

					{/* Worded, not arrows — these shift the frame in the box, the header
					    arrows only change which frame is on screen. */}
					<div className='flex items-center justify-between gap-3'>
						<span className='text-sm text-muted'>Pozycja w gnieździe</span>
						<div className='flex gap-2'>
							<button
								type='button'
								onClick={() => moveFrame(-1)}
								disabled={index <= 0}
								className='min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-30'
							>
								⇠ Przesuń
							</button>
							<button
								type='button'
								onClick={() => moveFrame(1)}
								disabled={index >= frames.length - 1}
								className='min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-30'
							>
								Przesuń ⇢
							</button>
						</div>
					</div>

					<Segmented<CombState>
						label='Stan ramki'
						value={frame.comb_state}
						options={COMB_STATE_OPTIONS}
						onChange={setFrameState}
					/>

					{isDrawn && (
						<>
							<div className='flex flex-col gap-2'>
								<span className='text-sm text-muted'>Szybki wybór</span>
								<div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
									{PRESETS.map((preset) => (
										<button
											key={preset.label}
											type='button'
											onClick={() => update(preset.values)}
											className='min-h-12 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-muted transition-colors hover:border-subtle hover:text-foreground'
										>
											{preset.label}
										</button>
									))}
								</div>
							</div>

							<div className='flex flex-col gap-2'>
								<FrameFill frame={frame} />
								<div className='flex justify-between text-xs text-subtle'>
									<span>Wypełnienie {filled * 10}%</span>
									<span className='flex items-center gap-1.5'>
									<span
										className='h-2 w-2 rounded-full'
										style={{ background: 'var(--comb-empty)' }}
									/>
									Puste {(FRAME_TENTHS - filled) * 10}%
								</span>
								</div>
							</div>

							<div className='flex flex-col gap-3'>
								{FRAME_RESOURCES.map((resource) => (
									<TenthsRow
										key={resource.key}
										label={resource.label}
										color={resource.color}
										value={frame[resource.key]}
										max={FRAME_TENTHS - filled + frame[resource.key]}
										onChange={(value) => update({ [resource.key]: value })}
									/>
								))}
							</div>

							<Segmented<CombCondition>
								label='Stan plastra'
								value={frame.wear}
								options={COMB_CONDITION_OPTIONS}
								onChange={(wear) => update({ wear })}
							/>
						</>
					)}

					{activeErrors.length > 0 && <p className='text-sm text-danger'>{activeErrors.join(' · ')}</p>}
				</div>
			)}

			{/* Everything below is computed by the service too — shown here to sanity-check on the spot. */}
			<div className='flex flex-col gap-3'>
				<h3 className='text-sm font-semibold text-muted'>Podsumowanie gniazda (liczone automatycznie)</h3>
				<div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
					<Stat
						label='Czerw'
						accent='var(--comb-brood)'
						value={formatPl(derived.brood_frames_equiv)}
						hint='ramek w przeliczeniu'
					/>
					<Stat
						label='Miód'
						accent='var(--comb-honey)'
						value={`${formatPl(derived.honey_kg, 2)} kg`}
						hint={`${formatPl(derived.honey_frames_equiv)} × ${formatPl(derived.frame_capacity_kg, 2)} kg`}
					/>
					<Stat
						label='Pierzga'
						accent='var(--comb-pollen)'
						value={formatPl(derived.pollen_frames_equiv)}
						hint='ramek w przeliczeniu'
					/>
					<Stat
						label='Wolne plastry'
						accent='var(--comb-empty)'
						value={formatPl(derived.empty_frames_equiv)}
						hint={`węza: ${derived.foundation_frames}`}
					/>
				</div>
			</div>
		</div>
	);
}
