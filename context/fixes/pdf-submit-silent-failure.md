# PDF Submit Silent Failure

## Overview

On the summary step, "Zapisz i pobierz PDF" can do nothing at all: the label never changes to "Generowanie…", no request is sent, and no error appears anywhere on screen. The form is invalid, but every message explaining why is rendered inside a step panel the stepper has hidden.

Reported from the field: the button was dead on a phone, and the same inspection went through on a desktop. Reproduced in the browser on a production build.

## Symptom

- Beekeeper reaches Podsumowanie and taps the submit button.
- Nothing happens. The label stays "Zapisz i pobierz PDF", the button is not disabled, no spinner, no error line.
- Looks identical to a slow network, so the natural read is "the free Render instance is cold". It is not — no request is made at all.

Reproduced with all 7 steps walked legitimately, then Matka edited to mark the queen without a colour, then back to the summary via the stepper indicator:

```
label before: "Zapisz i pobierz PDF"   disabled: false
label after:  "Zapisz i pobierz PDF"
requests to /api/generate-pdf: []
error text present: "Znakowana matka musi mieć kolor"
  → inside the Matka tabpanel, hidden=true, rendered 0×0, visible to user: false
```

## Root cause

Three things compound, in `app/components/inspection/InspectionForm.tsx`.

**1. The submit handler has no invalid branch.**

```js
const generatePdf = methods.handleSubmit(async (data) => {
  setSubmitState('submitting');
  …
});
```

`handleSubmit` validates the whole form and calls this callback only when it passes. There is no `onInvalid` second argument, so a failure sets the errors and returns silently. `setSubmitState('submitting')` lives *inside* the success branch, so the label cannot change on a validation failure, and `fetch` is never reached.

**2. The one error line on the summary only covers request failures.** `{submitState === 'error' && …}` is set in the `catch` around `fetch`. A validation failure never reaches it.

**3. Field-level errors land on hidden steps.** Ark UI renders non-current `Steps.Content` with `hidden`, so while the beekeeper is on Podsumowanie every message is in the document at 0×0. There is no summary-level error list and nothing scrolls the stepper to the offending step.

### Why the form was invalid at all

Two routes reach the summary with data the full schema rejects. `handleNext` validates (`methods.trigger(stepFields[currentStep])`) and refuses to advance, so neither route goes through it.

- **Voice — and this is the phone-only one.** In the `useInspectionDialogue` options:

  ```js
  goToStep: (index) => {
    for (let position = 0; position < index; position += 1) validatedSteps.current.add(position);
    steps.setStep(index);
  },
  ```

  The comment says this records progress "the way the Dalej button does", but `handleNext` *validates first and bails on failure*; this only marks. A spoken walk therefore marks every step it passes as validated without validating one. `isStepValid(SUMMARY_INDEX)` only counts how many are marked, so the summary unlocks. Voice is Chrome-on-Android only (`VoicePanel`'s own `unsupportedNote`), so this route does not exist on desktop — which is exactly the reported phone/PC split. Starting by voice and finishing by hand is enough: the spoken steps go in unvalidated and the manual ones bring the count to seven.

- **Editing from the summary.** Device-independent. "Edytuj" a section, change something, then return by clicking the **Podsumowanie** step indicator instead of "Dalej". The indicator is enabled because the count is still seven, and nothing re-validates the edited step. This is the route used for the reproduction above.

Which field actually failed on the reported phone session is unknown — nothing logs it, and the attached PDF is from the successful desktop run.

## Fix

1. **Give `handleSubmit` an `onInvalid` handler.** Set an error state, say which sections are wrong, and move the stepper to the first failing step. This alone converts a dead button into something a beekeeper can act on, whatever the underlying cause — and it is the part that matters most in the field.
2. **Make the voice walk validate**, or stop it marking steps as validated. Either `await methods.trigger(stepFields[position])` per step in `goToStep` and only mark what passes, or drop the marking and let the beekeeper confirm each section with "Dalej".
3. **Re-validate on the way back to the summary**, so a step edited from the summary cannot be laundered by clicking the indicator. Removing the edited index from `validatedSteps` when `handleEdit` runs is the smallest version of this.

Item 1 is the safety net and should land regardless. 2 and 3 close the two routes that make it necessary.

## Acceptance criteria

- With the form invalid, tapping submit produces a **visible** message on the summary screen naming the failing section, and moves the stepper to it. Verified by asserting on rendered, non-zero-size text — the existing messages are present in the DOM at 0×0, so a DOM query alone proves nothing.
- The button label still becomes "Generowanie…" on a valid submit, and the existing request-failure message still appears when `/api/generate-pdf` fails.
- A voice-driven walk cannot unlock the summary for a step whose data does not validate.
- Editing a section from the summary and returning via the step indicator re-validates that section.
- A valid inspection still produces the same PDF as before.
- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` and `next build` all green.

## What this fix does NOT cover

- The voice panel scroll lock — see `voice-panel-scroll-lock.md`.
- Persisting form state so a reload does not lose an inspection. That is the real cure for both of these being catastrophic rather than annoying, and it is its own piece of work.
- Any change to the schemas or to what counts as valid. Nothing here should relax a rule; the rules are fine, the reporting is not.
