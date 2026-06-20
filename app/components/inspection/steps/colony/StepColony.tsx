import { NumberField, RadioField } from '../../fields';
import { COLONY_BEHAVIOR_OPTIONS, COLONY_HIVE_SPACE_OPTIONS, COLONY_HONEY_STORES_OPTIONS } from './colony.schema';

export function StepColony() {
	return (
		<div className='grid gap-4'>
			<NumberField
				name='frames_covered'
				label='Obsiadane ramki'
				min={0}
				max={20}
			/>
			<RadioField
				name='behavior'
				label='Zachowanie'
				options={COLONY_BEHAVIOR_OPTIONS}
			/>
			<RadioField
				name='honey_stores'
				label='Zapasy miodu'
				options={COLONY_HONEY_STORES_OPTIONS}
			/>
			<RadioField
				name='hive_space'
				label='Przestrzeń'
				options={COLONY_HIVE_SPACE_OPTIONS}
			/>
			<NumberField
				name='honey_kg'
				label='Kilogramy miodu'
				min={0}
				max={200}
			/>
		</div>
	);
}
