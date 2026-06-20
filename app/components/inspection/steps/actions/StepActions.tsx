'use client';

import { MultiSelectField, TextareaField } from '../../fields';
import { ACTION_OPTIONS } from './actions.schema';

export function StepActions() {
	return (
		<div className='grid gap-4'>
			<p className='text-sm text-subtle'>
				Sekcja opcjonalna — pomiń, jeśli podczas przeglądu nie wykonano żadnych działań.
			</p>
			<MultiSelectField
				name='selected'
				label='Działania'
				options={ACTION_OPTIONS}
				placeholder='Wybierz wykonane działania...'
			/>
			<TextareaField
				name='other'
				label='Inne działania (opcjonalnie)'
				placeholder='Opisz działania spoza listy...'
			/>
		</div>
	);
}
