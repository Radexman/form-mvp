'use client';

import { Steps, useSteps } from '@ark-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { defaultValues, fullSchema, STEP_META, stepFields, type FormValues } from './schema';
import { StepBrood } from './steps/brood/StepBrood';
import { StepQueen } from './steps/queen/StepQueen';

const STEP_COMPONENTS = [StepQueen, StepBrood];

export function InspectionForm() {
	const methods = useForm<FormValues>({
		resolver: zodResolver(fullSchema),
		defaultValues,
		mode: 'onSubmit',
	});

	const validatedSteps = useRef<Set<number>>(new Set());

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

	const onSubmit = methods.handleSubmit((data) => {
		// TODO: replace with the real submit (server action / API call).
		console.log('Inspection submitted:', data);
	});

	return (
		<FormProvider {...methods}>
			<form
				onSubmit={onSubmit}
				className='mx-auto flex w-full max-w-3xl flex-col gap-8'
			>
				<Steps.RootProvider
					value={steps}
					className='flex flex-col gap-8'
				>
					<Steps.List className='flex items-center'>
						{STEP_META.map((meta, index) => (
							<Steps.Item
								key={meta.key}
								index={index}
								className='flex flex-1 items-center last:flex-none'
							>
								<Steps.Trigger className='group flex items-center gap-3 text-left'>
									<Steps.Indicator className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-sm text-muted transition-colors data-current:border-accent data-current:bg-accent data-current:text-background data-complete:border-accent-dim data-complete:bg-accent-dim data-complete:text-foreground'>
										{index + 1}
									</Steps.Indicator>
									<span className='hidden text-sm text-subtle transition-colors group-data-current:text-foreground group-data-complete:text-muted sm:inline'>
										{meta.title}
									</span>
								</Steps.Trigger>
								<Steps.Separator className='mx-3 h-px flex-1 bg-border transition-colors data-complete:bg-accent-dim' />
							</Steps.Item>
						))}
					</Steps.List>
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
					<div className='flex justify-between gap-3'>
						<Steps.PrevTrigger className='rounded-md border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'>
							Wstecz
						</Steps.PrevTrigger>
						{isLastStep ? (
							<button
								type='submit'
								className='rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground'
							>
								Zapisz
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
				</Steps.RootProvider>
			</form>
		</FormProvider>
	);
}
