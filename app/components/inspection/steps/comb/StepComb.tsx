import { NumberField, RadioField } from '../../fields';
import { COMB_CONDITION_OPTIONS } from './comb.schema';

export function StepComb() {
	return (
		<div className='grid gap-4'>
			<NumberField
				name='frames_brood'
				label='Czerw'
				min={0}
			/>
			<NumberField
				name='frames_honey'
				label='Miód'
				min={0}
			/>
			<NumberField
				name='frames_pollen'
				label='Pierzga'
				min={0}
			/>
			<NumberField
				name='frames_empty'
				label='Puste'
				min={0}
			/>
			<RadioField
				name='comb_condition'
				label='Stan plastrów'
				options={COMB_CONDITION_OPTIONS}
			/>
		</div>
	);
}
