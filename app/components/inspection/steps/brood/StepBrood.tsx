import { CheckboxGroupField, RatingField } from '../../fields';

const TYPE_OPTIONS = [
	{ value: 'eggs', label: 'Jaja' },
	{ value: 'open', label: 'Otwarty (larwy)' },
	{ value: 'capped', label: 'Kryty' },
	{ value: 'drone', label: 'Trutowy' },
];

export function StepBrood() {
	return (
		<div className='grid gap-4'>
			<CheckboxGroupField
				name='brood_types'
				label='Rodzaj'
				options={TYPE_OPTIONS}
			/>
			<RatingField
				name='brood_pattern'
				label='Zwartość'
				count={5}
			/>
		</div>
	);
}
