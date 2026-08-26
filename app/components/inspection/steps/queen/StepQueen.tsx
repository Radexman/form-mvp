'use client';

import { useEffect } from 'react';
import { useFormContext, useWatch, type FieldPath } from 'react-hook-form';

import type { FieldValues } from '../../../../lib/voice/fieldScript';
import { useStepDialogue } from '../../../../lib/voice/useStepDialogue';
import { CheckboxField, NumberField, RadioField, SwatchField } from '../../fields';
import type { FormValues } from '../../schema';
import { VoicePanel } from '../../VoicePanel';
import { QUEEN_CELLS_OPTIONS, QUEEN_MARKER_COLOR_OPTIONS, QUEEN_STATUS_OPTIONS } from './queen.schema';
import { QUEEN_FIELDS, queenVoiceStep, reconcileQueen } from './queen.voice';

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

	const dialogue = useStepDialogue(queenVoiceStep, {
		getValues: () => getValues() as FieldValues,
		setValue: (name, value) => setValue(name as FieldPath<FormValues>, value as never, { shouldDirty: true }),
	});

	return (
		<div className='grid gap-4'>
			<VoicePanel
				title='Sterowanie głosem'
				hint='Powiedz np. „widziana”, „znakowana”, „niebieski”, a na koniec „dalej”. Możesz też mówić „wstecz” i „stop”.'
				supported={dialogue.supported}
				running={dialogue.running}
				log={dialogue.log}
				error={dialogue.error}
				onStart={() => void dialogue.start()}
				onStop={dialogue.stop}
				unsupportedNote='Sterowanie głosem wymaga przeglądarki Chrome (Android). Tutaj wypełnij pola ręcznie.'
			/>

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
