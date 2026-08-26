import {
	FRAME_CAPACITY_KG,
	FRAME_TENTHS,
	SUFFICIENCY_LOW_FRAMES,
	SUFFICIENCY_SUFFICIENT_KG,
	type CombCondition,
	type CombValues,
	type FrameValues,
	type HoneySufficiency,
} from './comb.schema';

/**
 * Client-side port of CombData's @computed_field properties.
 *
 * Display only. The PDF service recomputes every one of these from the frames
 * we send, and rejects unknown keys — so none of this may enter the payload.
 * Kept as a literal transcription of the Python (same constants, same order of
 * operations, same rounding) so a divergence is easy to spot.
 */

const WEAR_SEVERITY: Record<CombCondition, number> = {
	good: 0,
	old: 1,
	needs_replacement: 2,
};

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/**
 * Polish decimal comma at fixed precision. Done by hand rather than via
 * toLocaleString so server and client render identically regardless of ICU.
 */
export function formatPl(value: number, digits = 1): string {
	return value.toFixed(digits).replace('.', ',');
}

export function frameFilled(frame: FrameValues): number {
	return frame.brood + frame.honey + frame.pollen;
}

/**
 * Remainder tenths. Foundation reads as fully empty here; deriveComb keeps the
 * two apart — drawn-and-empty is layable now, foundation is not.
 */
export function frameEmpty(frame: FrameValues): number {
	return FRAME_TENTHS - frameFilled(frame);
}

export interface CombDerived {
	frame_capacity_kg: number;
	honey_kg: number;
	honey_stores: HoneySufficiency;
	brood_frames_equiv: number;
	honey_frames_equiv: number;
	pollen_frames_equiv: number;
	empty_frames_equiv: number;
	occupied_frames: number;
	foundation_frames: number;
	comb_condition: CombCondition;
	/** Not from the service: drawn frames whose wear was left unset. */
	unrated_frames: number;
}

export function deriveComb(comb: CombValues): CombDerived {
	const frames = comb.frames ?? [];
	const capacity = FRAME_CAPACITY_KG[comb.frame_type] ?? FRAME_CAPACITY_KG.wielkopolska;

	const framesEquiv = (tenths: number) => round(tenths / FRAME_TENTHS, 1);
	const sumOf = (pick: (frame: FrameValues) => number) => frames.reduce((total, frame) => total + pick(frame), 0);

	const honeyTenths = sumOf((frame) => frame.honey);
	const honey_kg = round((honeyTenths / FRAME_TENTHS) * capacity, 2);

	let honey_stores: HoneySufficiency;
	if (honey_kg <= 0) honey_stores = 'none';
	else if (honey_kg < SUFFICIENCY_LOW_FRAMES * capacity) honey_stores = 'low';
	else if (honey_kg <= SUFFICIENCY_SUFFICIENT_KG) honey_stores = 'moderate';
	else honey_stores = 'sufficient';

	let comb_condition: CombCondition = 'good';
	for (const frame of frames) {
		if (frame.wear && WEAR_SEVERITY[frame.wear] > WEAR_SEVERITY[comb_condition]) comb_condition = frame.wear;
	}

	return {
		frame_capacity_kg: capacity,
		honey_kg,
		honey_stores,
		brood_frames_equiv: framesEquiv(sumOf((frame) => frame.brood)),
		honey_frames_equiv: framesEquiv(honeyTenths),
		pollen_frames_equiv: framesEquiv(sumOf((frame) => frame.pollen)),
		empty_frames_equiv: framesEquiv(
			frames.filter((frame) => frame.comb_state === 'drawn').reduce((total, frame) => total + frameEmpty(frame), 0),
		),
		occupied_frames: frames.filter((frame) => frame.brood || frame.honey || frame.pollen).length,
		foundation_frames: frames.filter((frame) => frame.comb_state === 'foundation').length,
		comb_condition,
		unrated_frames: frames.filter((frame) => frame.comb_state === 'drawn' && frame.wear === null).length,
	};
}
