import { CheckboxGroupField, RatingField } from '../../fields';
import { BROOD_TYPE_OPTIONS } from './brood.schema';

export function StepBrood() {
	return (
		<div className='grid gap-4'>
			<CheckboxGroupField
				name='brood_types'
				label='Rodzaj'
				options={BROOD_TYPE_OPTIONS}
			/>
			<RatingField
				name='brood_pattern'
				label='Zwartość'
				count={5}
			/>
		</div>
	);
}
