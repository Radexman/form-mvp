'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { CheckboxField, NumberField, RadioField, SwatchField } from '../../fields';
import type { FormValues } from '../../schema';
import { QUEEN_CELLS_OPTIONS, QUEEN_MARKER_COLOR_OPTIONS, QUEEN_STATUS_OPTIONS } from './queen.schema';

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
			<RadioField
				name='queen_status'
				label='Status'
				options={QUEEN_STATUS_OPTIONS}
			/>
			{showMarking && (
				<CheckboxField
					name='queen_marked'
					label='Znakowana'
				/>
			)}
			{showColor && (
				<SwatchField
					name='queen_marker_color'
					label='Kolor znakowania'
					options={QUEEN_MARKER_COLOR_OPTIONS}
				/>
			)}
			<RadioField
				name='queen_cells'
				label='Mateczniki'
				options={QUEEN_CELLS_OPTIONS}
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
