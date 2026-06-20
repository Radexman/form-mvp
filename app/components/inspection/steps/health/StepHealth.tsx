'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { CheckboxGroupField, NumberField, TextareaField, CheckboxField } from '../../fields';
import type { FormValues } from '../../schema';
import { HEALTH_CONDITION_OPTIONS } from './health.schema';

export function StepHealth() {
	const { control, setValue } = useFormContext<FormValues>();
	const conditionObserved = useWatch({ control, name: 'condition_observed' });
	const conditions = (useWatch({ control, name: 'conditions' }) as string[] | undefined) ?? [];

	const showVarroaCount = conditionObserved && conditions.includes('varroa');
	const showOther = conditionObserved && conditions.includes('other');

	useEffect(() => {
		if (!conditionObserved) setValue('conditions', [], { shouldValidate: true });
	}, [conditionObserved, setValue]);

	useEffect(() => {
		setValue('varroa_drop_count', showVarroaCount ? 0 : null, { shouldValidate: true });
	}, [showVarroaCount, setValue]);

	useEffect(() => {
		if (!showOther) setValue('health_other', '', { shouldValidate: true });
	}, [showOther, setValue]);

	return (
		<div className='grid gap-4'>
			<p className='text-sm text-subtle'>
				Sekcja opcjonalna — pozostaw niezaznaczoną, jeśli nie zaobserwowano objawów chorobowych.
			</p>
			<CheckboxField
				name='condition_observed'
				label='Czy zauważono niepokojące objawy'
			/>
			{conditionObserved && (
				<>
					<CheckboxGroupField
						name='conditions'
						label='Objawy / sygnały alarmowe'
						options={HEALTH_CONDITION_OPTIONS}
					/>
					{showVarroaCount && (
						<NumberField
							name='varroa_drop_count'
							label='Osyp warrozy (roztoczy / 24h)'
							min={0}
							max={500}
						/>
					)}
					{showOther && (
						<TextareaField
							name='health_other'
							label='Opis innego objawu'
							placeholder='Opisz zaobserwowany objaw...'
						/>
					)}
				</>
			)}
		</div>
	);
}
