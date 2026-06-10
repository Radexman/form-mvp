import z from 'zod';
import type { DefaultValues } from 'react-hook-form';

export const notesObject = z.object({
	notes: z.string().max(2000, 'Maksymalnie 2000 znaków'),
});

export const notesSchema = notesObject;

export type NotesValues = z.infer<typeof notesObject>;

export const notesDefaults: DefaultValues<NotesValues> = {
	notes: '',
};

export const notesStep = { key: 'notes', title: 'Uwagi / notatki swobodne' } as const;
