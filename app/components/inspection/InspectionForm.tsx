'use client';

import { Steps, useSteps } from '@ark-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, type FieldPath } from 'react-hook-form';

import { fetchCurrentWeather, type InspectionWeather } from '../../lib/inspection-context';
import { releaseAllScrollLocks } from '../../lib/scroll-lock';
import { useInspectionDialogue } from '../../lib/voice/useInspectionDialogue';
import { runCombStep } from '../../lib/voice/runCombStep';
import { CombViewContext } from './comb-view';
import { renumberFrames, type FrameValues } from './steps/comb/comb.schema';
import type { FieldValues } from '../../lib/voice/fieldScript';
import { VoicePanel } from './VoicePanel';
import type { Beehive } from '../../lib/beehives';
import { buildInspectionPayload } from './payload';
import { buildMeta } from './summary.helpers';
import { defaultValues, fullSchema, STEP_META, stepFields, type FormValues } from './schema';
import { StepBrood } from './steps/brood/StepBrood';
import { StepQueen } from './steps/queen/StepQueen';
import { StepColony } from './steps/colony/StepColony';
import { StepComb } from './steps/comb/StepComb';
import { StepActions } from './steps/actions/StepActions';
import { StepNotes } from './steps/notes/StepNotes';
import { StepHealth } from './steps/health/StepHealth';
import { StepSummary, type WeatherState } from './steps/summary/StepSummary';

const PDF_ENDPOINT = '/api/generate-pdf';

function filenameFromDisposition(header: string | null): string | undefined {
	const match = header?.match(/filename="?([^"]+)"?/);
	return match?.[1];
}

/**
 * Keyed by step, not indexed: schema.ts owns the order, and looking components
 * up by key means reordering there cannot leave this list pointing at the wrong
 * step.
 */
const STEP_COMPONENTS: Record<string, () => React.ReactElement> = {
	comb: StepComb,
	queen: StepQueen,
	brood: StepBrood,
	colony: StepColony,
	health: StepHealth,
	actions: StepActions,
	notes: StepNotes,
};

const SUMMARY_META = { key: 'summary', title: 'Podsumowanie' };
const ALL_STEPS = [...STEP_META, SUMMARY_META];
const SUMMARY_INDEX = STEP_META.length;
const TOTAL_STEPS = STEP_META.length + 1;

export function InspectionForm({ hive, onBack }: { hive: Beehive; onBack: () => void }) {
	const methods = useForm<FormValues>({
		resolver: zodResolver(fullSchema),
		defaultValues,
		mode: 'onSubmit',
	});

	const validatedSteps = useRef<Set<number>>(new Set());
	const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
	const [inspectionNumber, setInspectionNumber] = useState(String(hive.nextInspectionNumber));
	const [weather, setWeather] = useState<InspectionWeather | null>(null);
	const [weatherState, setWeatherState] = useState<WeatherState>('idle');
	// Comb's visible frame lives here so the spoken dialogue can move it.
	const [activeFrame, setActiveFrame] = useState(0);
	// A finished transcript can be closed without stopping anything.
	const [transcriptDismissed, setTranscriptDismissed] = useState(false);

	const steps = useSteps({
		count: TOTAL_STEPS,
		isStepValid: (index) =>
			index === SUMMARY_INDEX ? validatedSteps.current.size >= STEP_META.length : validatedSteps.current.has(index),
	});

	const currentStep = steps.value;
	const isLastStep = currentStep === SUMMARY_INDEX;

	// Navigation belongs here, where the stepper lives; step scripts only report
	// whether they finished or want to go back.
	const dialogue = useInspectionDialogue({
		steps: STEP_META,
		startIndex: () => Math.min(steps.value, STEP_META.length - 1),
		goToStep: (index) => {
			// Everything before the destination has been walked, so record it the
			// way the Dalej button does — otherwise the stepper shows no progress
			// and its triggers stay disabled after a spoken run.
			for (let position = 0; position < index; position += 1) validatedSteps.current.add(position);
			steps.setStep(index);
		},
		api: {
			getValues: () => methods.getValues() as FieldValues,
			setValue: (name, value) => methods.setValue(name as FieldPath<FormValues>, value as never, { shouldDirty: true }),
		},
		// Comb does not fit the field engine — it loops over frames rather than a
		// fixed list of fields — so it is supplied as a runner on the same runtime.
		runners: {
			comb: (runtime) =>
				runCombStep(runtime, {
					getFrames: () => (methods.getValues('frames') ?? []) as FrameValues[],
					setFrames: (frames) => methods.setValue('frames', renumberFrames(frames), { shouldDirty: true }),
					setSlots: (slots) => methods.setValue('slots', slots, { shouldDirty: true }),
					setActive: setActiveFrame,
				}),
		},
	});

	// The conversation bar is docked rather than overlaid, so the form reserves
	// room for it instead of letting it cover the controls.
	const voiceOpen = dialogue.running || (dialogue.log.length > 0 && !transcriptDismissed);

	// Nothing inside the form may strand a scroll lock on the way out: an
	// unscrollable page hides the step buttons, and the only recovery is a reload
	// that costs the whole inspection.
	useEffect(() => releaseAllScrollLocks, []);

	// Keep the screen on the field being asked. Imperative because scrolling is,
	// and because a ring on one element is not worth threading through every
	// field component as state.
	const voiceField = dialogue.status.fieldName;
	useEffect(() => {
		document.querySelectorAll('[data-voice-active]').forEach((node) => node.removeAttribute('data-voice-active'));
		if (!voiceField) return;
		const target = document.querySelector(`[data-field="${voiceField}"]`);
		if (!target) return;
		target.setAttribute('data-voice-active', '');
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [voiceField]);

	const loadWeather = useCallback(async () => {
		setWeatherState('loading');
		try {
			const result = await fetchCurrentWeather();
			setWeather(result);
			setWeatherState(result ? 'ready' : 'error');
		} catch (error) {
			console.warn('Weather fetch failed:', error);
			setWeather(null);
			setWeatherState('error');
		}
	}, []);

	const handleNext = async () => {
		const ok = await methods.trigger(stepFields[currentStep]);
		if (!ok) return;
		validatedSteps.current.add(currentStep);
		if (currentStep + 1 === SUMMARY_INDEX && weatherState === 'idle') {
			loadWeather();
		}
		steps.goToNextStep();
	};

	const handleEdit = (stepKey: string) => {
		const index = STEP_META.findIndex((meta) => meta.key === stepKey);
		if (index >= 0) steps.setStep(index);
	};

	const generatePdf = methods.handleSubmit(async (data) => {
		setSubmitState('submitting');
		try {
			const context = { meta: buildMeta(hive.number, inspectionNumber), weather };
			const response = await fetch(PDF_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(buildInspectionPayload(data, context)),
			});
			if (!response.ok) throw new Error(`Serwer odpowiedział ${response.status}`);

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filenameFromDisposition(response.headers.get('content-disposition')) ?? 'przeglad.pdf';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setSubmitState('idle');
		} catch (error) {
			console.error('PDF generation failed:', error);
			setSubmitState('error');
		}
	});

	return (
		<CombViewContext.Provider value={{ active: activeFrame, setActive: setActiveFrame }}>
			<FormProvider {...methods}>
				<form
					onSubmit={(event) => event.preventDefault()}
					className={`mx-auto flex w-full max-w-6xl flex-col gap-8 ${voiceOpen ? 'pb-[46dvh]' : ''}`}
				>
					<div className='flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between'>
						<div className='flex items-center gap-3'>
							<button
								type='button'
								onClick={onBack}
								className='rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2'
							>
								← Ule
							</button>
							<span className='text-sm text-foreground'>
								Ul nr <span className='font-semibold'>{hive.number}</span>
							</span>
						</div>
						<label className='flex items-center gap-2 text-sm text-muted'>
							Nr przeglądu
							<input
								type='number'
								min={1}
								inputMode='numeric'
								value={inspectionNumber}
								onChange={(event) => setInspectionNumber(event.target.value)}
								className='w-20 rounded-md border border-border bg-surface-2 px-3 py-2 text-foreground outline-none transition-colors focus:border-accent'
							/>
						</label>
					</div>
					<Steps.RootProvider
						value={steps}
						className='flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10'
					>
						<Steps.List className='flex flex-row gap-1 overflow-x-auto pb-2 sm:w-56 sm:shrink-0 sm:flex-col sm:gap-0 sm:overflow-visible sm:pb-0'>
							{ALL_STEPS.map((meta, index) => (
								<Steps.Item
									key={meta.key}
									index={index}
									className='flex items-center sm:flex-col sm:items-stretch'
								>
									<Steps.Trigger className='group flex items-center gap-3 text-left sm:py-1.5'>
										<Steps.Indicator className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm text-muted transition-colors data-current:border-accent data-current:bg-accent data-current:text-background data-complete:border-accent-dim data-complete:bg-accent-dim data-complete:text-foreground'>
											{index + 1}
										</Steps.Indicator>
										<span className='hidden text-sm text-subtle transition-colors group-data-current:text-foreground group-data-complete:text-muted sm:inline'>
											{meta.title}
										</span>
									</Steps.Trigger>
									{index < ALL_STEPS.length - 1 && (
										<Steps.Separator className='mx-3 h-px w-6 flex-none bg-border transition-colors data-complete:bg-accent-dim sm:mx-0 sm:my-1 sm:ml-4.25 sm:h-5 sm:w-px' />
									)}
								</Steps.Item>
							))}
						</Steps.List>
						<div className='flex min-w-0 flex-1 flex-col gap-8'>
							{!isLastStep && (
								<VoicePanel
									title='Sterowanie głosem'
									hint='Odpowiadaj na pytania, potwierdzaj słowem „dalej”. Po sekcji zapytam, czy przejść do kolejnej.'
									supported={dialogue.supported}
									running={dialogue.running}
									listening={dialogue.listening}
									log={dialogue.log}
									error={dialogue.error}
									open={voiceOpen}
									summary={dialogue.status.summary}
									onDismiss={() => setTranscriptDismissed(true)}
									onStart={() => {
										setTranscriptDismissed(false);
										void dialogue.start();
									}}
									onStop={dialogue.stop}
									unsupportedNote='Sterowanie głosem wymaga przeglądarki Chrome (Android). Wypełnij formularz ręcznie.'
								/>
							)}
							{STEP_META.map((meta, index) => {
								const StepComponent = STEP_COMPONENTS[meta.key];
								return (
									<Steps.Content
										key={meta.key}
										index={index}
										className='rounded-lg border border-border bg-surface p-4 sm:p-6'
									>
										<h2 className='mb-4 text-lg font-semibold text-foreground'>{meta.title}</h2>
										<StepComponent />
									</Steps.Content>
								);
							})}
							<Steps.Content
								key={SUMMARY_META.key}
								index={SUMMARY_INDEX}
								className='rounded-lg border border-border bg-surface p-4 sm:p-6'
							>
								<h2 className='mb-4 text-lg font-semibold text-foreground'>{SUMMARY_META.title}</h2>
								<StepSummary
									hiveNumber={hive.number}
									inspectionNumber={inspectionNumber}
									weather={weather}
									weatherState={weatherState}
									onRefreshWeather={loadWeather}
									onEdit={handleEdit}
								/>
							</Steps.Content>
							<Steps.CompletedContent className='rounded-lg border border-accent-dim bg-surface p-6 text-foreground'>
								Wszystkie kroki zostały ukończone.
							</Steps.CompletedContent>
							{submitState === 'error' && (
								<p className='text-sm text-danger'>
									Nie udało się wygenerować PDF. Sprawdź połączenie i spróbuj ponownie.
								</p>
							)}
							<div className='flex justify-between gap-3'>
								<Steps.PrevTrigger className='rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'>
									Wstecz
								</Steps.PrevTrigger>
								{isLastStep ? (
									<button
										type='button'
										onClick={generatePdf}
										disabled={submitState === 'submitting'}
										className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
									>
										{submitState === 'submitting' ? 'Generowanie…' : 'Zapisz i pobierz PDF'}
									</button>
								) : (
									<button
										type='button'
										onClick={handleNext}
										className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground'
									>
										Dalej
									</button>
								)}
							</div>
						</div>
					</Steps.RootProvider>
				</form>
			</FormProvider>
		</CombViewContext.Provider>
	);
}
