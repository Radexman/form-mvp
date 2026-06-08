'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { CheckboxField, NumberField, SelectField } from '../../fields';
import type { FormValues } from '../../schema';

const STATUS_OPTIONS = [
	{ value: 'seen', label: 'Widziana' },
	{ value: 'not_seen_brood_ok', label: 'Niewidziana, czerw OK' },
	{ value: 'missing', label: 'Brak matki' },
];

const COLOR_OPTIONS = [
	{ value: 'white', label: 'Biały' },
	{ value: 'yellow', label: 'Żółty' },
	{ value: 'red', label: 'Czerwony' },
	{ value: 'green', label: 'Zielony' },
	{ value: 'blue', label: 'Niebieski' },
];

const CELLS_OPTIONS = [
	{ value: 'none', label: 'Brak' },
	{ value: 'emergency', label: 'Ratunkowe' },
	{ value: 'swarm', label: 'Rojowe' },
	{ value: 'supersedure', label: 'Cicha wymiana' },
];

export function StepQueen() {
	const { control, setValue } = useFormContext<FormValues>();
	const queenMarked = useWatch({ control, name: 'queen_marked' });
	const queenCells = useWatch({ control, name: 'queen_cells' });
	const queenStatus = useWatch({ control, name: 'queen_status' });

	const showMarking = queenStatus !== 'missing';
	const showColor = showMarking && queenMarked === true;
	const showCellsCount = !!queenCells && queenCells !== 'none';

	useEffect(() => {
		if (!showMarking) {
			setValue('queen_marked', false, { shouldValidate: true });
		}
	}, [showMarking, setValue]);

	useEffect(() => {
		if (!showColor) {
			setValue('queen_marker_color', null, { shouldValidate: true });
		}
	}, [showColor, setValue]);

	useEffect(() => {
		setValue('queen_cells_count', showCellsCount ? 1 : 0, { shouldValidate: true });
	}, [showCellsCount, setValue]);

	return (
		<div className='grid gap-4'>
			<SelectField
				name='queen_status'
				label='Status'
				options={STATUS_OPTIONS}
			/>
			{showMarking && (
				<CheckboxField
					name='queen_marked'
					label='Znakowana'
				/>
			)}
			{showColor && (
				<SelectField
					name='queen_marker_color'
					label='Kolor znakowania'
					options={COLOR_OPTIONS}
				/>
			)}
			<SelectField
				name='queen_cells'
				label='Mateczniki'
				options={CELLS_OPTIONS}
			/>
			{showCellsCount && (
				<NumberField
					name='queen_cells_count'
					label='Liczba mateczników'
					min={1}
					max={50}
				/>
			)}
		</div>
	);
}
