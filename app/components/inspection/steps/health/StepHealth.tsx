'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { CheckboxGroupField, NumberField, TextareaField } from '../../fields';
import type { FormValues } from '../../schema';

const CONDITION_OPTIONS = [
	{ value: 'dwv', label: 'DWV (wirus zdeformowanych skrzydeł)' },
	{ value: 'foulbrood', label: 'Zgnilec' },
	{ value: 'dysentery', label: 'Biegunka' },
	{ value: 'varroa', label: 'Warroza' },
	{ value: 'chalkbrood', label: 'Grzybica wapienna' },
	{ value: 'acarine', label: 'Roztoczowica (świerzbowiec)' },
	{ value: 'wax_moth', label: 'Barciak (mól woskowy)' },
	{ value: 'other', label: 'Inne' },
];

export function StepHealth() {
	const { control, setValue } = useFormContext<FormValues>();
	const conditions = (useWatch({ control, name: 'conditions' }) as string[] | undefined) ?? [];

	const showVarroaCount = conditions.includes('varroa');
	const showOther = conditions.includes('other');

	useEffect(() => {
		setValue('varroa_drop_count', showVarroaCount ? 0 : null, { shouldValidate: true });
	}, [showVarroaCount, setValue]);

	useEffect(() => {
		if (!showOther) setValue('health_other', '', { shouldValidate: true });
	}, [showOther, setValue]);

	return (
		<div className='grid gap-4'>
			<p className='text-sm text-subtle'>
				Sekcja opcjonalna — pozostaw pustą, jeśli nie zaobserwowano objawów chorobowych.
			</p>
			<CheckboxGroupField
				name='conditions'
				label='Objawy / sygnały alarmowe'
				options={CONDITION_OPTIONS}
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
		</div>
	);
}
