import { z } from 'zod';
import type { DefaultValues, FieldPath } from 'react-hook-form';

import { broodDefaults, broodObject, broodSchema, broodStep } from './steps/brood/brood.schema';
import { queenDefaults, queenObject, queenSchema, queenStep } from './steps/queen/queen.schema';
import { colonyDefaults, colonyObject, colonySchema, colonyStep } from './steps/colony/colony.schema';

const STEPS = [
	{ ...queenStep, object: queenObject, defaults: queenDefaults },
	{ ...broodStep, object: broodObject, defaults: broodDefaults },
	{ ...colonyStep, object: colonyObject, defaults: colonyDefaults },
] as const;

export const STEP_META = STEPS.map(({ key, title }) => ({ key, title }));

export const fullSchema = queenSchema.and(broodSchema).and(colonySchema);

export type FormValues = z.infer<typeof fullSchema>;

export const stepFields: FieldPath<FormValues>[][] = STEPS.map(
	(step) => Object.keys(step.object.shape) as FieldPath<FormValues>[],
);

export const defaultValues: DefaultValues<FormValues> = Object.assign({}, ...STEPS.map((step) => step.defaults));
