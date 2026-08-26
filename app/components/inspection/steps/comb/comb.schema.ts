import z from 'zod';
import type { DefaultValues } from 'react-hook-form';

/**
 * Mirrors CombData (schema_version 2) in the PDF service. Frames are recorded in
 * tenths — 5 = 50%, 1 = 10% — which is how a frame gets eyeballed in the field,
 * no fraction conversion with gloves on.
 *
 * Everything the old form asked for directly (kg of honey, one count per
 * resource, a hive-level comb condition) is now derived from these frames. The
 * service computes it; see comb.derive.ts for the display-only client port.
 */

export const COMB_SCHEMA_VERSION = 2;
export const FRAME_TENTHS = 10;

export const COMB_CONDITION = ['good', 'old', 'needs_replacement'] as const;
export const COMB_STATE = ['foundation', 'drawn'] as const;
export const FRAME_TYPE = ['wielkopolska'] as const;
export const HONEY_SUFFICIENCY = ['sufficient', 'moderate', 'low', 'none'] as const;

export type CombCondition = (typeof COMB_CONDITION)[number];
export type CombState = (typeof COMB_STATE)[number];
export type FrameType = (typeof FRAME_TYPE)[number];
export type HoneySufficiency = (typeof HONEY_SUFFICIENCY)[number];

/** Measured: a wielkopolska frame (360x260) full of capped honey. */
export const FRAME_CAPACITY_KG: Record<FrameType, number> = {
	wielkopolska: 2.25,
};

/** Below one full frame of stores the colony has no buffer for a rained-out week. */
export const SUFFICIENCY_LOW_FRAMES = 1.0;
/** Above this the colony carries stores into winter unaided. */
export const SUFFICIENCY_SUFFICIENT_KG = 10.0;

export const MAX_SLOTS = 20;
export const DEFAULT_SLOTS = 10;

export const COMB_CONDITION_OPTIONS = [
	{ value: 'good', label: 'Dobry' },
	{ value: 'old', label: 'Stary' },
	{ value: 'needs_replacement', label: 'Do wymiany' },
];

export const COMB_STATE_OPTIONS = [
	{ value: 'drawn', label: 'Zbudowana' },
	{ value: 'foundation', label: 'Węza' },
];

export const FRAME_TYPE_OPTIONS = [{ value: 'wielkopolska', label: 'Wielkopolska gniazdowa' }];

export const HONEY_SUFFICIENCY_OPTIONS = [
	{ value: 'sufficient', label: 'Wystarczające' },
	{ value: 'moderate', label: 'Umiarkowane' },
	{ value: 'low', label: 'Małe' },
	{ value: 'none', label: 'Brak' },
];

/** The three things that can fill a frame, in the order they stack in the fill bar. */
export const FRAME_RESOURCES = [
	{ key: 'brood', label: 'Czerw', color: 'var(--comb-brood)' },
	{ key: 'honey', label: 'Miód', color: 'var(--comb-honey)' },
	{ key: 'pollen', label: 'Pierzga', color: 'var(--comb-pollen)' },
] as const;

export type FrameResource = (typeof FRAME_RESOURCES)[number]['key'];

const tenths = z
	.number('Podaj liczbę')
	.int('Podaj liczbę całkowitą')
	.min(0, 'Nie może być ujemne')
	.max(FRAME_TENTHS, `Maksymalnie ${FRAME_TENTHS}`);

export const frameSchema = z
	.object({
		position: z.number().int().min(1),
		comb_state: z.enum(COMB_STATE, 'Wybierz stan ramki'),
		brood: tenths,
		honey: tenths,
		pollen: tenths,
		wear: z.enum(COMB_CONDITION).nullable(),
	})
	.superRefine((frame, ctx) => {
		const filled = frame.brood + frame.honey + frame.pollen;
		if (filled > FRAME_TENTHS) {
			ctx.addIssue({
				code: 'custom',
				path: ['brood'],
				message: `Czerw + miód + pierzga to ${filled}/${FRAME_TENTHS} ramki`,
			});
		}
		if (frame.comb_state === 'foundation' && filled > 0) {
			ctx.addIssue({
				code: 'custom',
				path: ['comb_state'],
				message: 'Węza nie może zawierać czerwiu, miodu ani pierzgi',
			});
		}
	});

export type FrameValues = z.infer<typeof frameSchema>;

export const combObject = z.object({
	frame_type: z.enum(FRAME_TYPE, 'Wybierz typ ramki'),
	slots: z
		.number('Podaj liczbę')
		.int('Podaj liczbę całkowitą')
		.min(1, 'Minimum 1')
		.max(MAX_SLOTS, `Maksymalnie ${MAX_SLOTS}`),
	low_confidence: z.boolean(),
	frames: z.array(frameSchema).min(1, 'Ul musi mieć przynajmniej jedną ramkę'),
});

export const combSchema = combObject.superRefine((comb, ctx) => {
	const positions = comb.frames.map((frame) => frame.position);

	if (comb.frames.length > comb.slots) {
		ctx.addIssue({
			code: 'custom',
			path: ['frames'],
			message: `Ramek (${comb.frames.length}) jest więcej niż miejsc w ulu (${comb.slots})`,
		});
	}
	if (new Set(positions).size !== positions.length) {
		ctx.addIssue({ code: 'custom', path: ['frames'], message: 'Zduplikowane pozycje ramek' });
	}
	if (positions.some((position) => position > comb.slots)) {
		ctx.addIssue({ code: 'custom', path: ['frames'], message: 'Pozycja ramki poza gniazdem' });
	}
});

export type CombValues = z.infer<typeof combObject>;

/**
 * A fresh frame reads as drawn comb in good condition — the overwhelmingly
 * common observation, and stated rather than assumed: the service derives the
 * hive-level condition from these, so a null everywhere would silently report
 * "good". Foundation carries no wear at all (see setFrameState in StepComb).
 */
export function makeFrame(position: number): FrameValues {
	return { position, comb_state: 'drawn', brood: 0, honey: 0, pollen: 0, wear: 'good' };
}

export const combDefaults: DefaultValues<CombValues> = {
	frame_type: 'wielkopolska',
	slots: DEFAULT_SLOTS,
	low_confidence: false,
	frames: Array.from({ length: DEFAULT_SLOTS }, (_, index) => makeFrame(index + 1)),
};

export const combStep = { key: 'comb', title: 'Plastry i zasoby' } as const;
