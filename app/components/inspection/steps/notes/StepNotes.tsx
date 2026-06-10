'use client';

import { TextareaField } from '../../fields';

export function StepNotes() {
	return (
		<div className='grid gap-4'>
			<p className='text-sm text-subtle'>Sekcja opcjonalna — pomiń, jeśli nie ma dodatkowych uwag.</p>
			<TextareaField
				name='notes'
				label='Notatki / uwage'
				placeholder='Notatki swobodne'
			/>
		</div>
	);
}
