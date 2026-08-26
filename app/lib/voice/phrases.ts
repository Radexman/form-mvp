import { FRAME_TENTHS, type FrameValues } from '../../components/inspection/steps/comb/comb.schema';
import { ordinalPl } from './grammar';

/**
 * Everything the app says out loud, in one place. Pure functions so the wording
 * can be tested without a speaker.
 *
 * Read-back is in percent rather than tenths: it is what the screen shows and
 * what the beekeeper reasons about, and "osiemdziesiąt procent" cannot be
 * misheard as the count "osiem" the way "osiem" alone could.
 */

const WEAR_SPEECH: Record<string, string> = {
	good: 'plaster dobry',
	old: 'plaster stary',
	needs_replacement: 'plaster do wymiany',
};

export const ASK_SLOTS = 'Ile jest ramek w ulu?';
export const ASK_BROOD = 'Czerw?';
export const ASK_HONEY = 'Miód?';
export const ASK_POLLEN = 'Pierzga?';

export const NOT_UNDERSTOOD = 'Nie zrozumiałem. Powiedz na przykład: miód osiem, pierzga jeden.';
/** Asked after each frame's read-back, except the last — there is no next one. */
export const CONFIRM_NEXT_FRAME = 'Przejść do kolejnej ramki?';
/** The last frame in the box: the step, not another frame, is what follows. */
export const CONFIRM_LAST_FRAME = 'Dalej?';
export const REPAIR_INTRO = 'Zapytam po kolei.';
export const FINISHED = 'Gotowe. Wszystkie ramki zapisane.';
export const STOPPED = 'Przerwane.';

export function askSlotsAgain(max: number): string {
	return `Nie zrozumiałem. Podaj liczbę od jeden do ${max}.`;
}

export function announceFrame(position: number): string {
	return `Ramka ${ordinalPl(position)}`;
}

export function overflowWarning(total: number): string {
	return `To razem ${total * 10} procent, czyli więcej niż cała ramka. Powtórz proszę.`;
}

/**
 * "Ramka trzecia: miód 80 procent, puste 20 procent, plaster dobry. Przejść do
 * kolejnej ramki?" — the closing question is passed in, since the last frame in
 * the box has no next frame to offer.
 */
export function readBack(frame: FrameValues, position: number, question: string = CONFIRM_NEXT_FRAME): string {
	const head = `Ramka ${ordinalPl(position)}`;

	if (frame.comb_state === 'foundation') {
		return `${head}: węza. ${question}`;
	}

	const parts: string[] = [];
	if (frame.brood > 0) parts.push(`czerw ${frame.brood * 10} procent`);
	if (frame.honey > 0) parts.push(`miód ${frame.honey * 10} procent`);
	if (frame.pollen > 0) parts.push(`pierzga ${frame.pollen * 10} procent`);

	const empty = FRAME_TENTHS - (frame.brood + frame.honey + frame.pollen);
	if (empty > 0) parts.push(`puste ${empty * 10} procent`);

	if (frame.wear) parts.push(WEAR_SPEECH[frame.wear]);

	return `${head}: ${parts.join(', ')}. ${question}`;
}
