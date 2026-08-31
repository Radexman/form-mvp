# Voice Panel Scroll Lock

## Overview

Expanding the voice conversation to full screen and then closing it without collapsing it first leaves `document.body.style.overflow = 'hidden'` set forever. The page cannot be scrolled by touch, wheel or keyboard afterwards, the "Dalej" button sits below the fold and is unreachable, and the only way out is a reload — which discards the whole inspection.

Reproduced in the browser at 390×844 and confirmed on a real phone by the user.

## Symptom

- Chat mode is opened, expanded to full screen, then closed.
- The page looks normal. The conversation bar is gone. Nothing indicates a modal state.
- Scrolling does nothing. `Dalej` is ~1000px below the fold on a 844px-tall viewport and cannot be reached.
- Reload is the only recovery, and it loses every answer entered so far.

Measured with real input events, viewport 390×844, page 1989px tall:

| State | wheel −800 | `End` key |
| --- | --- | --- |
| Lock leaked | `scrollY` 0 → **0** | `scrollY` 0 → **0** |
| `body.style.overflow` cleared by hand | 0 → **800** | → **1165** (bottom) |

`window.scrollTo()` still works while locked, which is why this is easy to miss in a console poke: `overflow: hidden` blocks *user* scrolling only. Any check must use real wheel/keyboard/touch input.

## Root cause

`app/components/inspection/VoicePanel.tsx`:

```js
useEffect(() => {
  if (!expanded) return;
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = previous;
  };
}, [expanded]);
```

**The cleanup is keyed to `expanded`, but what removes the panel from the screen is `open`.** They are different variables, and `open` is not in the dependency list.

`VoicePanel` renders two things: the launcher button, always; and the docked conversation `<section>`, only when `open`. `open` comes from the parent as `dialogue.running || (log.length > 0 && !transcriptDismissed)`. Closing the conversation flips `open` to false — which unmounts the `<section>` but **not `VoicePanel` itself**, since the launcher is still on screen. `expanded` never changes, so React never runs the cleanup, and the lock survives with no chevron left anywhere in the document to undo it.

Confirmed: after closing, `document.body.style.overflow` is still `"hidden"`, `section[aria-label="Rozmowa"]` is gone, and computed `html { overflow-y: visible }` / `body { overflow-y: hidden }` means the body's value propagates to the viewport.

Two supporting observations:

- **`expanded` also persists across a close/reopen.** Reopening the conversation after a leak brings it back full screen (`aria-expanded="true"`, section covering the viewport) rather than docked. Surprising on its own, and it means the state that caused the lock is still armed.
- **The leak is self-healing only while the panel is open.** Expanding and collapsing again restores the captured `previous`. But once the panel is closed, that control does not exist, which is exactly why it feels unrecoverable.

## Fix

1. **Key the lock to what is actually on screen**, not to `expanded` alone:

   ```js
   const fullscreen = open && expanded;
   useEffect(() => { if (!fullscreen) return; … }, [fullscreen]);
   ```

   Closing the conversation then fires the cleanup, because `fullscreen` changes.

2. **Reset `expanded` to false when `open` goes false**, so reopening starts docked. Without this, the next conversation opens full screen for no reason the beekeeper asked for.

3. **Stop capturing and restoring `previous`.** Capture-and-restore is only correct while exactly one thing in the app locks scroll. The moment a second locker exists — a dialog, a sheet, an Ark UI component with `preventScroll` — the second one captures `'hidden'` as its "previous" and restores `'hidden'` on the way out, which is this same bug with no single-component fix. Restore `''` outright, or move the lock behind a small counted helper in `app/lib/`.

4. **Add an unmount safety net** in `InspectionForm` (`useEffect(() => () => { document.body.style.overflow = ''; }, [])`), so leaving the form can never strand a lock regardless of which child set it.

Items 1 and 2 are the fix. 3 and 4 are what stop it recurring the next time something needs to lock scroll.

## Acceptance criteria

- Expand the conversation to full screen, close it with `Stop` / `Zamknij` without collapsing: the page scrolls afterwards, verified with a **real wheel event and the `End` key**, not `window.scrollTo`.
- `document.body.style.overflow` is back to its pre-open value once the conversation is closed, in every combination of collapse-then-close and close-while-expanded.
- Reopening the conversation after a close starts docked, not full screen.
- While the conversation *is* expanded, the page behind it still does not scroll — the original reason the lock exists.
- Leaving the form entirely (back to the hive picker, or reaching the summary step) never leaves a lock behind.
- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` and `next build` all green.

## What this fix does NOT cover

- The unrelated silent-failure bug on the PDF button — see `pdf-submit-silent-failure.md`.
- The `pb-[46dvh]` the form keeps while `voiceOpen` is true, including on the summary step where `VoicePanel` is not rendered at all. Harmless padding today; worth a look if the summary ever gains a fixed footer.
- iOS Safari, where `body { overflow: hidden }` is an unreliable scroll lock in the *other* direction (it often fails to hold). Not a problem here, since voice is Android-Chrome only.
