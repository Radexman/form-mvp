import { NumberField, SelectField } from '../../fields';

const BEHAVIOR_OPTIONS = [
	{ value: 'calm', label: 'Spokojne' },
	{ value: 'nervous', label: 'Nerwowe' },
	{ value: 'aggressive', label: 'Agresywne' },
	{ value: 'swarm_mood', label: 'Nastrój rojowy' },
];

const HONEY_STORES_OPTIONS = [
	{ value: 'sufficient', label: 'Wystarczające' },
	{ value: 'low', label: 'Małe' },
	{ value: 'none', label: 'Brak' },
];

const HIVE_SPACE_OPTIONS = [
	{ value: 'ok', label: 'Wystarczająca' },
	{ value: 'tight', label: 'Ciasno' },
	{ value: 'loose', label: 'Luźno' },
	{ value: 'added_super', label: 'Nadstawka' },
];

export function StepColony() {
	return (
		<div className='grid gap-4'>
			<NumberField
				name='frames_covered'
				label='Obsiadane ramki'
				min={0}
				max={20}
			/>
			<SelectField
				name='behavior'
				label='Zachowanie'
				options={BEHAVIOR_OPTIONS}
			/>
			<SelectField
				name='honey_stores'
				label='Zapasy miodu'
				options={HONEY_STORES_OPTIONS}
			/>
			<SelectField
				name='hive_space'
				label='Przestrzeń'
				options={HIVE_SPACE_OPTIONS}
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
