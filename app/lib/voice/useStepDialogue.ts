'use client';

import { useCallback, useEffect, useRef } from 'react';

import { runFieldScript, type FieldScriptApi, type VoiceStep } from './fieldScript';
import { useDialogueRuntime } from './useDialogueRuntime';

/**
 * Runs one step's declarative script. Steps with a fixed list of fields need
 * nothing more than this; comb keeps its own loop because it walks an unbounded
 * number of frames rather than a fixed list.
 */
export function useStepDialogue(step: VoiceStep, api: FieldScriptApi) {
	const runtime = useDialogueRuntime();

	// The loop outlives any single render, so reach the form through a ref.
	const apiRef = useRef(api);
	useEffect(() => {
		apiRef.current = api;
	});

	const start = useCallback(
		() =>
			runtime.run(async () => {
				const outcome = await runFieldScript(runtime, step, {
					getValues: () => apiRef.current.getValues(),
					setValue: (name, value) => apiRef.current.setValue(name, value),
				});
				if (outcome === 'done') await runtime.announce('Zapisane.');
			}),
		[runtime, step],
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
