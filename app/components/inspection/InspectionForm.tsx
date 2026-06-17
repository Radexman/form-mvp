'use client';

import { Steps, useSteps } from '@ark-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { getInspectionContext } from '../../lib/inspection-context';
import type { Beehive } from '../../lib/beehives';
import { buildInspectionPayload } from './payload';
import { defaultValues, fullSchema, STEP_META, stepFields, type FormValues } from './schema';
import { StepBrood } from './steps/brood/StepBrood';
import { StepQueen } from './steps/queen/StepQueen';
import { StepColony } from './steps/colony/StepColony';
import { StepComb } from './steps/comb/StepComb';
import { StepActions } from './steps/actions/StepActions';
import { StepNotes } from './steps/notes/StepNotes';
import { StepHealth } from './steps/health/StepHealth';

const PDF_ENDPOINT = '/api/generate-pdf';

function filenameFromDisposition(header: string | null): string | undefined {
	const match = header?.match(/filename="?([^"]+)"?/);
	return match?.[1];
}

const STEP_COMPONENTS = [StepQueen, StepBrood, StepColony, StepComb, StepActions, StepNotes, StepHealth];

export function InspectionForm({ hive, onBack }: { hive: Beehive; onBack: () => void }) {
	const methods = useForm<FormValues>({
		resolver: zodResolver(fullSchema),
		defaultValues,
		mode: 'onSubmit',
	});

	const validatedSteps = useRef<Set<number>>(new Set());
	const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'error'>('idle');
	const [inspectionNumber, setInspectionNumber] = useState(String(hive.nextInspectionNumber));

	const steps = useSteps({
		count: STEP_META.length,
		isStepValid: (index) => validatedSteps.current.has(index),
	});

	const currentStep = steps.value;
	const isLastStep = currentStep === STEP_META.length - 1;

	const handleNext = async () => {
		const ok = await methods.trigger(stepFields[currentStep]);
		if (!ok) return;
		validatedSteps.current.add(currentStep);
		steps.goToNextStep();
	};

	const generatePdf = methods.handleSubmit(async (data) => {
		setSubmitState('submitting');
		try {
			const context = await getInspectionContext({
				hive_number: hive.number,
				inspection_number: inspectionNumber,
			});
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
		<FormProvider {...methods}>
			<form
				onSubmit={(event) => event.preventDefault()}
				className='mx-auto flex w-full max-w-6xl flex-col gap-8'
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
						{STEP_META.map((meta, index) => (
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
								{index < STEP_META.length - 1 && (
									<Steps.Separator className='mx-3 h-px w-6 flex-none bg-border transition-colors data-complete:bg-accent-dim sm:mx-0 sm:my-1 sm:ml-4.25 sm:h-5 sm:w-px' />
								)}
							</Steps.Item>
						))}
					</Steps.List>
					<div className='flex min-w-0 flex-1 flex-col gap-8'>
						{STEP_COMPONENTS.map((StepComponent, index) => (
							<Steps.Content
								key={STEP_META[index].key}
								index={index}
								className='rounded-lg border border-border bg-surface p-6'
							>
								<h2 className='mb-4 text-lg font-semibold text-foreground'>{STEP_META[index].title}</h2>
								<StepComponent />
							</Steps.Content>
						))}
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
	);
}
