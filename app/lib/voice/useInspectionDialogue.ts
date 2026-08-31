'use client';

import { useCallback, useEffect, useRef } from 'react';

import { runFieldScript, type FieldScriptApi, type StepOutcome } from './fieldScript';
import { parseControl } from './grammar';
import { useDialogueRuntime, type DialogueRuntime } from './useDialogueRuntime';
import { VOICE_SCRIPTS } from './voiceSteps';

/**
 * Walks the form's steps by voice.
 *
 * A step script only ever reports what happened — "done" or "back" — and this
 * decides where to go next, so navigation lives in one place instead of being
 * re-invented per step. After a step is confirmed it offers the hand-off
 * ("Przejść do kolejnej sekcji?") and, on yes, carries straight on into the
 * next step's questions rather than ending the session.
 */

export interface StepRef {
	key: string;
	title: string;
}

export interface InspectionDialogueOptions {
	steps: StepRef[];
	/** Index the walk should begin from — normally the step on screen. */
	startIndex: () => number;
	/**
	 * Move the form to a step; the walk keeps the screen in sync as it goes.
	 * Awaited, so a navigator that has to validate first can do so.
	 */
	goToStep: (index: number) => void | Promise<void>;
	api: FieldScriptApi;
	/**
	 * Steps with a hand-written dialogue, by key. They take the same runtime and
	 * report the same outcome as a declarative script, so the walk treats them
	 * identically.
	 */
	runners?: Record<string, (runtime: DialogueRuntime) => Promise<StepOutcome>>;
}

export function useInspectionDialogue({ steps, startIndex, goToStep, api, runners }: InspectionDialogueOptions) {
	const runtime = useDialogueRuntime();

	// The walk outlives any single render, so reach the outside through refs.
	const depsRef = useRef({ steps, startIndex, goToStep, api, runners });
	useEffect(() => {
		depsRef.current = { steps, startIndex, goToStep, api, runners };
	});

	const start = useCallback(
		() =>
			runtime.run(async () => {
				const list = depsRef.current.steps;
				const scriptApi: FieldScriptApi = {
					getValues: () => depsRef.current.api.getValues(),
					setValue: (name, value) => depsRef.current.api.setValue(name, value),
				};
				// Through the ref on every call: the walk outlives the render it
				// started in, and a captured navigator would move a stale stepper.
				const go = async (target: number) => {
					await depsRef.current.goToStep(target);
				};

				let index = Math.min(Math.max(depsRef.current.startIndex(), 0), list.length - 1);

				for (;;) {
					runtime.guard();
					const step = list[index];
					runtime.setStatus({ stepKey: step.key, fieldName: null, summary: null });
					const custom = depsRef.current.runners?.[step.key];
					const script = VOICE_SCRIPTS[step.key];

					if (!custom && !script) {
						await runtime.announce(`Sekcja ${step.title} nie jest jeszcze obsługiwana głosem. Wypełnij ją ręcznie.`);
						return;
					}

					const outcome = custom ? await custom(runtime) : await runFieldScript(runtime, script!, scriptApi);

					if (outcome === 'back') {
						if (index === 0) {
							await runtime.announce('To pierwsza sekcja.');
							continue;
						}
						index -= 1;
						await go(index);
						continue;
					}

					if (index === list.length - 1) {
						await runtime.announce('Zapisane. To była ostatnia sekcja.');
						return;
					}

					await runtime.announce('Zapisane. Przejść do kolejnej sekcji?');
					const answer = await runtime.askWith(parseControl);

					if (answer?.kind === 'stop') return;
					if (answer?.kind === 'back') {
						index = Math.max(0, index - 1);
						await go(index);
						continue;
					}
					if (answer?.kind === 'next') {
						index += 1;
						await go(index);
						continue;
					}

					// "nie", "popraw", or nothing understood — stay put rather than
					// advancing on an answer we are not sure about.
					await runtime.announce('Zostaję w tej sekcji.');
					return;
				}
			}),
		[runtime],
	);

	return {
		supported: runtime.supported,
		running: runtime.running,
		listening: runtime.listening,
		log: runtime.log,
		error: runtime.error,
		status: runtime.status,
		start,
		stop: runtime.stop,
	};
}
