'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FieldValues } from '../../../../lib/voice/fieldScript';
import { CheckboxField, NumberField, RadioField, SwatchField } from '../../fields';
import type { FormValues } from '../../schema';
import { QUEEN_CELLS_OPTIONS, QUEEN_MARKER_COLOR_OPTIONS, QUEEN_STATUS_OPTIONS } from './queen.schema';
import { QUEEN_FIELDS, reconcileQueen } from './queen.voice';

export function StepQueen() {
	const { control, getValues, setValue } = useFormContext<FormValues>();

	const queenStatus = useWatch({ control, name: 'queen_status' });
	const queenMarked = useWatch({ control, name: 'queen_marked' });
	const queenCells = useWatch({ control, name: 'queen_cells' });

	// The on-screen controls need the same reconciliation the spoken script gets:
	// unticking "znakowana" by hand must clear the colour, or the schema rejects
	// the step. Both paths run reconcileQueen so they cannot disagree.
	useEffect(() => {
		const current = getValues() as FieldValues;
		const next = reconcileQueen(current);
		for (const field of QUEEN_FIELDS) {
			if (next[field] !== current[field]) {
				setValue(field, next[field] as never, { shouldValidate: true });
			}
		}
	}, [queenStatus, queenMarked, queenCells, getValues, setValue]);

	return (
		<div className='grid gap-4'>
			<RadioField
				name='queen_status'
				label='Status'
				options={QUEEN_STATUS_OPTIONS}
			/>
			{queenStatus !== 'missing' && (
				<CheckboxField
					name='queen_marked'
					label='Znakowana'
				/>
			)}
			{queenStatus !== 'missing' && queenMarked && (
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
			{queenCells && queenCells !== 'none' && (
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
