# Honeycomb Backdrop Spec

## Overview

The drifting honeycomb behind `/sign-in` and `/register` is the strongest piece of brand art in the app, and it exists in exactly one place. This feature extracts it into a reusable decorative layer and applies it to three more surfaces — quietly, and without animation.

Two things have to be true when this is done: there is **one** implementation of the pattern in the codebase, and it can be rendered **many times in one document**. The current `AuthBackdrop` satisfies neither — its own doc comment says it must be rendered exactly once per document, because the comb is an SVG `<pattern>` addressed by a hardcoded id.

## Scope

**In:**

- A reusable `HoneycombBackdrop` component in `app/components/ui/`.
- `AuthBackdrop` rewritten on top of it, keeping the auth screens pixel-identical.
- Three new placements: the desktop sidebar, the `/profile` identity card, the dashboard empty state.

**Out:** see [What this spec does NOT cover](#what-this-spec-does-not-cover).

## Placements

The app was audited surface by surface. These three get the pattern:

| #   | Surface                | File                                                                                     | Why it fits                                                                                                                                                                                    |
| --- | ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Desktop sidebar        | `app/components/dashboard/Sidebar.tsx` — the `<aside>`                                    | 192px of flat `bg-surface`, always on screen, holding no content of its own. The one persistent chrome element with room to breathe.                                                             |
| 2   | Profile identity card  | `app/(dashboard)/profile/page.tsx` — the first `<section>` (avatar / name / plan badge)   | The page's hero card, mostly empty to the right of the 56px avatar, and the only card of its shape on the page — so repetition is not a risk.                                                    |
| 3   | Dashboard empty state  | `NoApiary` in `app/(dashboard)/dashboard/page.tsx`                                        | The largest blank area in the signed-in app: a full-height centred column with a heading and one paragraph. Every fresh Google sign-in lands here, so it is a first-impression screen showing nothing. |

**Already covered, no change needed.** `/register/check-email`, `/verify-email`, `/forgot-password` and `/reset-password` all render inside `app/(auth)/layout.tsx`. They inherit the backdrop the moment `AuthBackdrop` is migrated.

**Rejected, and why — do not add these later without re-reading this list:**

- **`HiveCard` / `AlertCard`** — up to 8 and 3 instances in a single viewport. Repeating the comb per card is the exact "too eye-catching" failure this feature is trying to avoid.
- **`MobileNav`** — the mobile counterpart to the sidebar, so symmetry argues for it. But it is a 56px strip already carrying four icon + label pairs; a pattern behind them is noise, not texture.
- **`Topbar` / `TopbarShell`** — sticky, with page content scrolling underneath. Decoration there competes with whatever is passing beneath it.
- **`/` (`InspectionApp`)** — the inspection form is the densest screen in the app. The natural home for brand art is a future marketing landing page, not the form host.
- **`StepSummary`** — a "moment" screen in principle, but wall-to-wall data cards in practice.
- **`DeleteAccountDialog`** — a destructive confirmation must not be decorated.
- **`public/email/comb-backdrop.png`** — the email keeps its flat raster. No mail client renders an SVG `<pattern>` or runs CSS animation, and the component must not grow a code path trying.

## Component

`app/components/ui/HoneycombBackdrop.tsx` — a decorative, absolutely positioned layer with no children. Server component; nothing about it needs the client.

Proposed API (names open, shape is not):

| Prop        | Default                   | Purpose                                                                                        |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `animated`  | `false`                   | Opt in to the drift. Only the auth screens pass `true`.                                          |
| `tone`      | accent                    | The stroke colour. Baked into the pattern — see the traps.                                       |
| `opacity`   | low                       | The tuning knob that decides whether a placement reads as texture or as clutter.                 |
| `tileSize`  | auth's current tile        | A 192px sidebar and a full-width empty state do not want the same cell size.                     |
| `fade`      | none                      | Optional edge mask, so the pattern can die out rather than hit a border.                         |
| `className` | —                         | Positioning and inset overrides at the call site.                                                |
| `debug`     | `false`                   | Renders at full opacity in a loud colour, for tuning without editing the component.              |

Non-negotiable behaviour: `aria-hidden='true'`, `pointer-events-none`, and a stable marker attribute (e.g. `data-honeycomb`) so any instance can be found in devtools without hunting through class strings.

## Implementation notes and traps

- **The id collision is why this is a rewrite, not an extraction.** `AuthBackdrop` renders `<pattern id='auth-comb'>` and references it by `url(#auth-comb)`. Four instances means four duplicate ids in one document. Two ways out:
  1. `useId()` — correct, but forces `'use client'` onto a purely decorative layer.
  2. **A data-URI SVG `background-image`** — no ids at all, tiles via `background-repeat`, sizes via `background-size`, stays a server component. **Prefer this.**
- **The cost of the data URI: `currentColor` stops working.** The stroke colour must be encoded into the URI string, so the component builds it from the `tone` prop. That is also what turns per-surface tinting into a prop rather than a fork. **URL-encode the `#` in any hex colour** — an unencoded `#` truncates the URI at the fragment and the pattern silently vanishes. This is the single most likely bug in the feature.
- **Keep the drift on `transform`.** The existing `.comb-drift` keyframes in `app/globals.css` and the `--comb-tile` custom property already guarantee a seamless one-tile loop — the last frame is pixel-identical to the first, one cell over. Reuse them by rendering the layer one tile wider and offset left, exactly as `AuthBackdrop` does today. Animating `background-position` would also loop, but drops off the compositor for no gain.
- **`overflow-hidden` on the parent is load-bearing** wherever the layer is oversized — without it the overhang becomes horizontal page scroll. Auth Phase 3 hit this. The parent also needs `relative` in every case.
- **Opacity ceiling.** Auth uses `text-accent/6` over a dark wash, with nothing but hero copy on top. The sidebar and the profile card carry 11–13px text and `rgba(255,255,255,0.06)` hairline borders — expect to land lower than 6%. Verify at the end that the sidebar's active nav tint (`bg-accent/5`, `border-l-accent`) and every card hairline still read.
- **`prefers-reduced-motion`** is already handled by the `.comb-drift` rule and must stay handled.
- **Restart the dev server before debugging the CSS.** This repo has been bitten three times by Turbopack staleness — new `@theme` keys, new `'use server'` modules, and edited `globals.css`. If this feature touches a keyframe or adds a theme key, that is the first thing to check, not the markup.
- **Testing:** nothing here is unit-testable unless the URI builder is extracted as a pure function. If it is, give it a small suite — tile geometry and colour encoding, including the `#` case above.

## Acceptance criteria

- One component owns the pattern. A search for the hex path data returns exactly one file.
- `/sign-in` and `/register` are visually unchanged, and the drift is still seamless at the loop point.
- The sidebar, the `/profile` identity card and the dashboard empty state each show the pattern, static, at an opacity that reads as texture rather than decoration.
- All three new placements can coexist on one page load with no duplicate DOM ids and no console warnings.
- No horizontal scroll at 320 / 390 / 768 / 1440.
- The active sidebar nav item and every card hairline still read exactly as they did before.
- `prefers-reduced-motion: reduce` stops the auth drift.
- `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` and `next build` all green.

## What this spec does NOT cover

- Any new placement beyond the three listed, including the rejected surfaces above.
- The email backdrop PNG.
- A light theme. The pattern is tuned for the dark palette only.
- Making the pattern interactive or content-bearing in any way — it stays `aria-hidden` decoration.
