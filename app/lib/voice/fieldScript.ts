import { matchBoolean, matchChoice, matchNumber, type Choice } from './choice';
import { parseControl, type ControlCommand } from './grammar';
import { Aborted, MAX_RETRIES, type DialogueRuntime } from './useDialogueRuntime';

/**
 * A declarative spoken script for one form step.
 *
 * Steps describe their fields next to their zod schema; this walks them, asks
 * each in turn, reads the step back and waits for confirmation. Nothing is
 * step-specific here, so every step after comb reuses the same retry,
 * navigation and confirmation behaviour.
 *
 * Comb keeps its own hand-written loop — it is an unbounded loop over frames,
 * not a fixed list of fields — but shares the runtime underneath.
 */

export type FieldValues = Record<string, unknown>;

interface FieldBase {
	name: string;
	/** What the app asks, e.g. "Matka?" */
	prompt: string;
	/** Skipped entirely when this returns false. Mirror the zod refinements. */
	when?: (values: FieldValues) => boolean;
	/** How the answer is read back, or null to leave it out of the summary. */
	readBack: (value: unknown) => string | null;
}

export type VoiceField =
	| (FieldBase & { kind: 'choice'; choices: Choice[] })
	| (FieldBase & { kind: 'boolean'; yes?: string[]; no?: string[] })
	| (FieldBase & { kind: 'number'; min: number; max: number });

export interface VoiceStep {
	key: string;
	/**
	 * Optional line before the first question. Most steps skip it — the first
	 * prompt already names the subject, so announcing it first is one spoken
	 * turn of nothing.
	 */
	intro?: string;
	fields: VoiceField[];
	/**
	 * Keep dependent fields consistent after every answer — the spoken
	 * equivalent of the schema's cross-field refinements.
	 */
	reconcile?: (values: FieldValues) => FieldValues;
}

export interface FieldScriptApi {
	getValues: () => FieldValues;
	setValue: (name: string, value: unknown) => void;
}

/** How a step ended, so the caller can decide where to go next. */
export type StepOutcome = 'done' | 'back';

function matchField(field: VoiceField, transcript: string): unknown | null {
	switch (field.kind) {
		case 'choice':
			return matchChoice(transcript, field.choices);
		case 'boolean':
			return matchBoolean(transcript, field.yes, field.no);
		case 'number':
			return matchNumber(transcript, field.min, field.max);
	}
}

type Answer = { field: VoiceField; value: unknown };

export function summarise(step: VoiceStep, values: FieldValues): string {
	const parts = step.fields
		.filter((field) => field.when?.(values) ?? true)
		.map((field) => field.readBack(values[field.name]))
		.filter((part): part is string => Boolean(part));
	return parts.join(', ');
}

export async function runFieldScript(
	runtime: DialogueRuntime,
	step: VoiceStep,
	api: FieldScriptApi,
): Promise<StepOutcome> {
	const { announce, askWith, guard, resetMisses } = runtime;

	const commit = (patch: FieldValues) => {
		const merged = { ...api.getValues(), ...patch };
		const reconciled = step.reconcile ? step.reconcile(merged) : merged;
		for (const [name, value] of Object.entries(reconciled)) {
			if (value !== api.getValues()[name]) api.setValue(name, value);
		}
	};

	/** One field, until it is settled or the beekeeper navigates away. */
	const askField = async (field: VoiceField): Promise<'answered' | 'undo' | 'back'> => {
		let attempts = 0;
		for (;;) {
			guard();
			// The field's own vocabulary first, navigation only as a fallback, so a
			// choice word can never be swallowed by a control word.
			const result = await askWith<{ value: unknown } | ControlCommand>((transcript) => {
				const value = matchField(field, transcript);
				if (value !== null) return { value };
				return parseControl(transcript);
			});

			if (result === null) {
				attempts += 1;
				// Leave it at its default rather than blocking the whole step; the
				// read-back will show what was kept.
				if (attempts > MAX_RETRIES) return 'answered';
				await announce(`Nie zrozumiałem. ${field.prompt}`);
				continue;
			}

			if ('value' in result) {
				commit({ [field.name]: result.value });
				return 'answered';
			}

			switch (result.kind) {
				case 'stop':
					throw new Aborted();
				case 'back':
					return 'back';
				case 'undo':
					return 'undo';
				case 'next':
					// Nothing said for this field — keep the default and move on.
					return 'answered';
				case 'repeat':
					await announce(field.prompt);
					continue;
			}
		}
	};

	restart: for (;;) {
		if (step.intro) await announce(step.intro);

		let index = 0;
		while (index < step.fields.length) {
			guard();
			const field = step.fields[index];

			if (!(field.when?.(api.getValues()) ?? true)) {
				index += 1;
				continue;
			}

			await announce(field.prompt);
			const turn = await askField(field);

			if (turn === 'back') return 'back';
			if (turn === 'undo') {
				index = Math.max(0, index - 1);
				continue;
			}
			index += 1;
		}

		// --- read back, then wait for an explicit decision --------------------
		await announce(`${summarise(step, api.getValues())}. Dalej?`);
		for (;;) {
			guard();

			const answer = await askWith<Answer | ControlCommand>((transcript) => {
				// Control words win here, the reverse of a field prompt: after a
				// read-back "tak" and "nie" are answers to "Dalej?", not values for
				// whichever boolean field happens to be listed first.
				const control = parseControl(transcript);
				if (control) return control;

				// Otherwise any field in the step can be amended by naming its
				// value, e.g. "niebieski" after a mis-heard colour.
				for (const field of step.fields) {
					if (!(field.when?.(api.getValues()) ?? true)) continue;
					const value = matchField(field, transcript);
					if (value !== null) return { field, value } satisfies Answer;
				}
				return null;
			});

			if (answer === null) {
				// Nothing heard for a long while — ask the short question again
				// rather than reciting the whole step.
				await announce('Dalej?');
				continue;
			}
			if ('field' in answer) {
				commit({ [answer.field.name]: answer.value });
				await announce(`${summarise(step, api.getValues())}. Dalej?`);
				continue;
			}
			switch (answer.kind) {
				case 'stop':
					throw new Aborted();
				case 'next':
					return 'done';
				case 'back':
					return 'back';
				case 'undo':
					resetMisses();
					continue restart;
				case 'repeat':
					await announce(`${summarise(step, api.getValues())}. Dalej?`);
					continue;
			}
		}
	}
}
