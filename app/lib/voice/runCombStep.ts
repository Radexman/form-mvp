import {
	FRAME_TENTHS,
	MAX_SLOTS,
	makeFrame,
	type FrameValues,
} from '../../components/inspection/steps/comb/comb.schema';
import { applyFrameCommand } from './applyFrameCommand';
import type { StepOutcome } from './fieldScript';
import type { Command } from './grammar';
import * as say from './phrases';
import { Aborted, MAX_RETRIES, type DialogueRuntime } from './useDialogueRuntime';

/**
 * The comb step, spoken.
 *
 * Kept as a hand-written runner rather than a declarative field script because
 * it walks an unbounded number of frames rather than a fixed list of fields.
 * It shares the runtime with every other step, so retries, the give-up rule,
 * abort and the transcript all behave identically.
 *
 * Ask how many slots, then take the frames one at a time: announce the frame,
 * take one utterance describing it, read it back, wait for "dalej". Nothing is
 * committed until that confirmation, so a mishear cannot land in the report
 * unnoticed.
 */

type ConfirmOutcome = { kind: 'commit' } | { kind: 'jump'; position: number } | { kind: 'redo'; draft: FrameValues };

export interface CombStepApi {
	getFrames: () => FrameValues[];
	setFrames: (frames: FrameValues[]) => void;
	setSlots: (slots: number) => void;
	/** Highlights the frame being discussed, so the screen follows the dialogue. */
	setActive: (index: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export async function runCombStep(runtime: DialogueRuntime, api: CombStepApi): Promise<StepOutcome> {
	const { announce, ask, guard, noteMiss, resetMisses, setError, setStatus } = runtime;

	const writeDraft = (index: number, draft: FrameValues) => {
		api.setFrames(api.getFrames().map((frame, i) => (i === index ? draft : frame)));
	};

	/** Merge a command onto a draft, saying out loud why anything was refused. */
	const applyCommand = async (draft: FrameValues, command: Command): Promise<FrameValues | null> => {
		if (command.kind !== 'frame') return draft;
		const result = applyFrameCommand(draft, command);
		if (result.ok) return result.frame;
		await announce(say.overflowWarning(result.total));
		return null;
	};

	const askSlots = async (): Promise<number> => {
		await announce(say.ASK_SLOTS);

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			const command = await ask();
			if (command?.kind === 'stop') throw new Aborted();
			if (command?.kind === 'number' && command.value >= 1 && command.value <= MAX_SLOTS) return command.value;
			if (attempt < MAX_RETRIES) await announce(say.askSlotsAgain(MAX_SLOTS));
		}
		setError('Nie udało się ustalić liczby miejsc. Ustaw ją ręcznie.');
		throw new Aborted();
	};

	/** Fallback when a whole-frame utterance will not parse: one resource at a time. */
	const repairFrame = async (draft: FrameValues): Promise<FrameValues> => {
		// Reaching repair already cost MAX_RETRIES misses; without clearing the
		// streak a single unclear answer here would abort the whole dialogue.
		resetMisses();
		await announce(say.REPAIR_INTRO);

		const questions = [
			{ key: 'brood', prompt: say.ASK_BROOD },
			{ key: 'honey', prompt: say.ASK_HONEY },
			{ key: 'pollen', prompt: say.ASK_POLLEN },
		] as const;

		let next: FrameValues = { ...draft, comb_state: 'drawn', brood: 0, honey: 0, pollen: 0 };
		for (const { key, prompt } of questions) {
			await announce(prompt);
			const command = await ask();
			if (command?.kind === 'stop') throw new Aborted();

			let value = 0;
			if (command?.kind === 'number') value = command.value;
			else if (command?.kind === 'frame' && command.values[key] !== undefined) value = command.values[key];

			const remaining = FRAME_TENTHS - (next.brood + next.honey + next.pollen);
			next = { ...next, [key]: clamp(value, 0, Math.max(remaining, 0)) };
		}
		return next;
	};

	/** Read back, then wait for an explicit decision. Never commits on its own. */
	const confirmFrame = async (
		initial: FrameValues,
		position: number,
		index: number,
		slots: number,
	): Promise<ConfirmOutcome> => {
		let draft = initial;
		writeDraft(index, draft);
		await announce(say.readBack(draft, position));

		for (;;) {
			guard();

			const answer = await ask();
			if (!answer) {
				// Nothing heard for a long while — the short question again, rather
				// than reciting the whole frame or complaining about the silence.
				await announce(say.CONFIRM_AGAIN);
				continue;
			}
			switch (answer.kind) {
				case 'stop':
					throw new Aborted();
				case 'next':
					return { kind: 'commit' };
				case 'undo':
					return { kind: 'redo', draft: makeFrame(position) };
				case 'back':
					return { kind: 'jump', position: Math.max(1, position - 1) };
				case 'goto':
					return { kind: 'jump', position: clamp(answer.position, 1, slots) };
				case 'frame': {
					const applied = await applyCommand(draft, answer);
					if (applied) {
						draft = applied;
						writeDraft(index, draft);
						await announce(say.readBack(draft, position));
					}
					continue;
				}
				default:
					continue;
			}
		}
	};

	/** Runs one frame and returns the position to visit next; 0 means leave the step. */
	const runFrame = async (position: number, slots: number): Promise<number> => {
		const index = position - 1;
		api.setActive(index);
		setStatus({ summary: `${say.announceFrame(position)} z ${slots}` });

		// What the frame held before this visit. The draft is written through as it
		// is dictated so the screen mirrors the conversation, so leaving without
		// confirming has to put the previous values back.
		const snapshot = api.getFrames()[index] ?? makeFrame(position);
		let committed = false;

		try {
			let draft = makeFrame(position);
			let misses = 0;

			await announce(say.announceFrame(position));

			for (;;) {
				guard();
				const command = await ask();

				if (!command) {
					misses += 1;
					if (misses <= MAX_RETRIES) {
						await announce(say.NOT_UNDERSTOOD);
						continue;
					}
					draft = await repairFrame(draft);
					misses = 0;
				} else {
					switch (command.kind) {
						case 'stop':
							throw new Aborted();
						case 'back':
							// Backing out of the first frame leaves the step entirely.
							return position === 1 ? 0 : position - 1;
						case 'goto':
							return clamp(command.position, 1, slots);
						case 'next':
							// Nothing was dictated, so the frame is what was announced:
							// drawn and empty. There is nothing to mishear, so commit it.
							writeDraft(index, draft);
							committed = true;
							return position + 1;
						case 'undo':
							draft = makeFrame(position);
							await announce(say.announceFrame(position));
							continue;
						case 'frame': {
							// At this prompt an utterance describes the whole frame, so it
							// replaces rather than merges; amendments happen at confirm.
							const applied = await applyCommand(makeFrame(position), command);
							if (!applied) continue;
							draft = applied;
							break;
						}
						case 'repeat':
							await announce(say.announceFrame(position));
							continue;
						default:
							// A bare number here is ambiguous — say so rather than
							// re-listening in silence.
							noteMiss();
							await announce(say.NOT_UNDERSTOOD);
							continue;
					}
				}

				const outcome = await confirmFrame(draft, position, index, slots);
				if (outcome.kind === 'commit') {
					committed = true;
					return position + 1;
				}
				if (outcome.kind === 'jump') return outcome.position;

				draft = outcome.draft;
				await announce(say.announceFrame(position));
			}
		} finally {
			if (!committed) writeDraft(index, snapshot);
		}
	};

	const slots = await askSlots();
	api.setSlots(slots);
	// Resize rather than rebuild: frames already entered — by hand or by an
	// earlier run — survive, and each is overwritten only once confirmed.
	const existing = api.getFrames();
	api.setFrames(Array.from({ length: slots }, (_, i) => ({ ...(existing[i] ?? makeFrame(i + 1)), position: i + 1 })));

	let position = 1;
	while (position <= slots) {
		guard();
		position = await runFrame(position, slots);
		// Backing out of the first frame hands the walk back a step.
		if (position === 0) return 'back';
	}

	return 'done';
}
