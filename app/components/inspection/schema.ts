import { z } from 'zod';
import type { DefaultValues, FieldPath } from 'react-hook-form';

import { broodDefaults, broodObject, broodSchema, broodStep } from './steps/brood/brood.schema';
import { queenDefaults, queenObject, queenSchema, queenStep } from './steps/queen/queen.schema';
import { colonyDefaults, colonyObject, colonySchema, colonyStep } from './steps/colony/colony.schema';
import { combDefaults, combObject, combSchema, combStep } from './steps/comb/comb.schema';
import { actionsDefaults, actionsObject, actionsSchema, actionsStep } from './steps/actions/actions.schema';
import { notesDefaults, notesObject, notesSchema, notesStep } from './steps/notes/notes.schema';
import { healthDefaults, healthObject, healthSchema, healthStep } from './steps/health/health.schema';

/**
 * Field order, not form order: the frames come out of the box first, the queen
 * is spotted while they do, brood is read off those same frames, and what was
 * done to the colony is recorded after seeing its condition. Notes close.
 *
 * This array is the single source of order — components are looked up by key
 * (see InspectionForm), so reordering here cannot desynchronise them.
 */
const STEPS = [
	{ ...combStep, object: combObject, defaults: combDefaults },
	{ ...queenStep, object: queenObject, defaults: queenDefaults },
	{ ...broodStep, object: broodObject, defaults: broodDefaults },
	{ ...colonyStep, object: colonyObject, defaults: colonyDefaults },
	{ ...healthStep, object: healthObject, defaults: healthDefaults },
	{ ...actionsStep, object: actionsObject, defaults: actionsDefaults },
	{ ...notesStep, object: notesObject, defaults: notesDefaults },
] as const;

export const STEP_META = STEPS.map(({ key, title }) => ({ key, title }));

export const fullSchema = queenSchema
	.and(broodSchema)
	.and(colonySchema)
	.and(combSchema)
	.and(actionsSchema)
	.and(notesSchema)
	.and(healthSchema);

export type FormValues = z.infer<typeof fullSchema>;

export const stepFields: FieldPath<FormValues>[][] = STEPS.map(
	(step) => Object.keys(step.object.shape) as FieldPath<FormValues>[],
);

export const defaultValues: DefaultValues<FormValues> = Object.assign({}, ...STEPS.map((step) => step.defaults));
