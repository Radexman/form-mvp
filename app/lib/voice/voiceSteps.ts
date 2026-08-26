import { queenVoiceStep } from '../../components/inspection/steps/queen/queen.voice';
import type { VoiceStep } from './fieldScript';

/**
 * Which form steps have a spoken script, keyed the same way as STEP_META.
 *
 * The walker reads this to know how far it can go. Adding a step to voice means
 * writing its `*.voice.ts` and registering it here — nothing else.
 */
export const VOICE_SCRIPTS: Partial<Record<string, VoiceStep>> = {
	queen: queenVoiceStep,
};

/**
 * Steps the walker deliberately hands back rather than driving. Comb is not
 * missing a script — it has its own dialogue, because it loops over an
 * unbounded number of frames rather than a fixed list of fields.
 */
export const SELF_DRIVEN_STEPS: Record<string, string> = {
	comb: 'Sekcja plastrów ma własne sterowanie głosem. Użyj przycisku w tej sekcji.',
};
