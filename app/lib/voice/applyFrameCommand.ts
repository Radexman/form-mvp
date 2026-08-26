import { FRAME_TENTHS, type FrameValues } from '../../components/inspection/steps/comb/comb.schema';
import type { FrameCommand } from './grammar';

/**
 * Merge a spoken frame command onto a draft.
 *
 * Pure and separate from the dialogue so the decisions can be tested without a
 * microphone, and so the same rules can back other steps once voice covers more
 * of the form. Refusals are returned, not spoken — the caller decides what to
 * say about them.
 */

export type ApplyResult = { ok: true; frame: FrameValues } | { ok: false; reason: 'overflow'; total: number };

export function applyFrameCommand(draft: FrameValues, command: FrameCommand): ApplyResult {
	const namesResources = Object.keys(command.values).length > 0;

	// "węza" on its own clears the frame; paired with resources it is a
	// contradiction, and the resources are the more specific statement.
	if (command.state === 'foundation' && !namesResources) {
		return {
			ok: true,
			frame: { ...draft, comb_state: 'foundation', brood: 0, honey: 0, pollen: 0, wear: null },
		};
	}

	const next: FrameValues = {
		...draft,
		...command.values,
		...(command.state ? { comb_state: command.state } : {}),
		...(command.wear ? { wear: command.wear } : {}),
	};

	if (next.comb_state === 'foundation') {
		// Naming a resource on a foundation frame means it was drawn after all —
		// this is how a mis-heard "węza" gets corrected without touching the screen.
		if (namesResources) next.comb_state = 'drawn';
		else return { ok: true, frame: { ...next, brood: 0, honey: 0, pollen: 0, wear: null } };
	}
	if (next.wear === null) next.wear = 'good';

	const total = next.brood + next.honey + next.pollen;
	if (total > FRAME_TENTHS) return { ok: false, reason: 'overflow', total };

	return { ok: true, frame: next };
}
