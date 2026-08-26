'use client';

import { useCallback, useEffect, useRef } from 'react';

import { runFieldScript, type FieldScriptApi } from './fieldScript';
import { parseControl } from './grammar';
import { useDialogueRuntime } from './useDialogueRuntime';
import { SELF_DRIVEN_STEPS, VOICE_SCRIPTS } from './voiceSteps';

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
	/** Move the form to a step; the walk keeps the screen in sync as it goes. */
	goToStep: (index: number) => void;
	api: FieldScriptApi;
}

export function useInspectionDialogue({ steps, startIndex, goToStep, api }: InspectionDialogueOptions) {
	const runtime = useDialogueRuntime();

	// The walk outlives any single render, so reach the outside through refs.
	const depsRef = useRef({ steps, startIndex, goToStep, api });
	useEffect(() => {
		depsRef.current = { steps, startIndex, goToStep, api };
	});

	const start = useCallback(
		() =>
			runtime.run(async () => {
				const { steps: list, startIndex: from, goToStep: go } = depsRef.current;
				const scriptApi: FieldScriptApi = {
					getValues: () => depsRef.current.api.getValues(),
					setValue: (name, value) => depsRef.current.api.setValue(name, value),
				};

				let index = Math.min(Math.max(from(), 0), list.length - 1);

				for (;;) {
					runtime.guard();
					const step = list[index];
					const script = VOICE_SCRIPTS[step.key];

					if (!script) {
						await runtime.announce(
							SELF_DRIVEN_STEPS[step.key] ??
								`Sekcja ${step.title} nie jest jeszcze obsługiwana głosem. Wypełnij ją ręcznie.`,
						);
						return;
					}

					const outcome = await runFieldScript(runtime, script, scriptApi);

					if (outcome === 'back') {
						if (index === 0) {
							await runtime.announce('To pierwsza sekcja.');
							continue;
						}
						index -= 1;
						go(index);
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
						go(index);
						continue;
					}
					if (answer?.kind === 'next') {
						index += 1;
						go(index);
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
		log: runtime.log,
		error: runtime.error,
		start,
		stop: runtime.stop,
	};
}
