import { broodVoiceStep } from '../../components/inspection/steps/brood/brood.voice';
import { queenVoiceStep } from '../../components/inspection/steps/queen/queen.voice';
import type { VoiceStep } from './fieldScript';

/**
 * Which form steps have a declarative spoken script, keyed the same way as
 * STEP_META. Adding a step to voice means writing its `*.voice.ts` and
 * registering it here — nothing else.
 *
 * Steps whose dialogue does not fit a fixed list of fields (comb, which loops
 * over frames) are supplied as custom runners by the form instead.
 */
export const VOICE_SCRIPTS: Partial<Record<string, VoiceStep>> = {
	queen: queenVoiceStep,
	brood: broodVoiceStep,
};
