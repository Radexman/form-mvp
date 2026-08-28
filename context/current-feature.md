# Current Feature: Dashboard Spec 1 — Static Layout

## Status

In Progress — branch `feat/dashboard-static-layout`

## Goals

- `/dashboard` renders without TypeScript, build, or console errors.
- A `(dashboard)` route group exists with a shared `layout.tsx` owning the sidebar + main shell; `dashboard/page.tsx` is the static page.
- Four new components: `Sidebar`, `Topbar`, `AlertCard`, `HiveCard` (plus a `StrengthDots` and a `Badge` the spec's markup implies).
- Shell is full-viewport: 192px fixed sidebar that does not scroll, main area scrolls independently, topbar sticky at `z-10` with a surface background and bottom border.
- Sidebar nav drives its active state from `usePathname()`; active item gets a 2px green left border and `rgba(74,222,128,0.05)` tint, inactive keeps a transparent 2px left border so nothing shifts.
- Topbar renders apiary name + location on the left and two buttons on the right — "Dodaj ul" secondary, "Nowy przegląd" primary green — both with an inline 13px stroked plus icon.
- Alerts section: 3-column grid of the three hardcoded alerts; warning cards carry an amber left border, danger a red one, each with the matching tinted badge ("Uwaga" / "Alarm").
- Hive grid: 4 columns, 8 hardcoded cards. Hives 3 and 8 get an amber top border, hive 4 a red one, hives 1/2/5/6/7 no colored border.
- `StrengthDots` renders 5 dots with `value` filled, tinted to the card's status (green / amber / red); empty dots are outline-only.
- Queen label text and color follow the status mapping (`seen` green, `not_seen_brood_ok` amber, `missing` red).
- Every hive card shows a "Szczegóły" ghost button and a green "Przegląd" primary button.
- No hardcoded hex values in components — all color goes through CSS custom properties.

## Notes

**Source:** `context/features/dashboard-spec-1.md`. Visual reference: `context/screenshots/dashboard.png`, `context/templates/dashboard.html` (a complete standalone HTML/CSS mock — the spec is essentially a transcription of it, so the template is the tiebreaker on anything the spec leaves out).

**Explicitly out of scope:** auth guard, session/user fetching, real DB data, click handlers, responsive/mobile, the Analytics and Settings pages.

### Decisions made at `/feature start`

1. **Palette:** retune `globals.css` to the template values (option 1 below). The inspection form inherits the darker treatment — accepted.
2. **Nav:** `Dashboard` → `/dashboard` (grid-2x2, active here), `Analityka` → `/analytics`, `Ustawienia` → `/settings`. Matches the template and makes the active-state criterion pass. `/apiary` is dropped for now.
3. **Wordmark:** `Hivewise`, per the spec — not the template's `GetApiary`.
4. **Components live in `app/components/dashboard/`**, following repo convention.
5. **Spec 2 seeds the real data.** Every hardcoded array here is a placeholder — keep the component prop shapes clean and data-agnostic so swapping in seeded records is a change to the page, not to the components.

### Conflicts as found (resolved above)

1. **The spec's token table is not what `app/globals.css` actually contains.** The spec says "use the existing token set" and then lists the *template's* palette. Existing vs. spec:

   | Token | `globals.css` today | Spec / template |
   |---|---|---|
   | `--background` | `#0f1710` | `#0d0f0d` |
   | `--surface` | `#1c2b1e` | `#141814` |
   | `--surface-2` | `#243528` | `#1a1f1a` |
   | `--surface-3` | `#2d4232` | `#202620` |
   | `--foreground` | `#f0fdf4` | `#e8f0e8` |
   | `--muted` | `#86efac` | `#6b7d6b` |
   | `--subtle` | `#4b7a57` | `#3a4a3a` |
   | `--border` | `#2d4232` (solid) | `rgba(255,255,255,0.06)` |
   | `--border-2` | **does not exist** | `rgba(255,255,255,0.10)` |
   | `--accent-warm` | `#fcd34d` | `#fbbf24` |

   `--accent` (`#4ade80`) and `--danger` (`#f87171`) already agree. Decision needed: retune `globals.css` to the darker template palette (matches the screenshot, but restyles the existing inspection form too), or build the dashboard on the current greener tokens (won't match the reference). Either way `--border-2` has to be added, and both new tokens need `@theme inline` entries to be reachable as Tailwind classes.

2. **The nav has no `/dashboard` entry, so nothing can be active on `/dashboard`.** The spec's table lists Pasieka → `/apiary`, Analityka → `/analytics`, Ustawienia → `/settings`, but the template and screenshot show the first item labeled **Dashboard** and highlighted. The acceptance criterion "Active nav item has green left border" cannot pass as written. Likely fix: first item is `Dashboard` → `/dashboard` with the grid-2x2 icon.

3. **Logo wordmark:** spec says `Hivewise`, template and screenshot say `GetApiary`. Root layout metadata already says `Hivewise` — going with the spec unless told otherwise.

4. **Component location:** spec asks for a root-level `components/dashboard/`. This repo has no root `components/`; everything lives under `app/components/<domain>/`. Plan to follow repo convention and use `app/components/dashboard/`.

### Details the spec omits, filled from the template

- Alerts section label is **Wymagają uwagi**; hive section label **Ule** with subtitle **8 uli wielkopolskich**.
- Topbar text: **Pasieka Turawa** · **Turawa, woj. opolskie**.
- Sidebar structure: logo block with its own bottom border, `nav` flexed to `flex: 1`, footer with a top border; avatar is a 28px circle, `--surface-3` background, `--accent` initials, `--border-2` ring.
- Hive card footer is `margin-top: auto` in a column so cards in a row stay aligned at unequal heights.
- Empty `StrengthDots` border is `--subtle` in the template but `--surface-3` in the spec — the two are the same value today in `globals.css`, so pick one deliberately.

### Implementation constraints

- Tailwind v4 with `@theme inline`; existing components use utility classes only, no CSS modules. Rgba tints (`rgba(74,222,128,0.05)`), the `#22c55e` hover, and exact pixel values from the spec will need arbitrary values or new tokens.
- Sidebar needs `usePathname()`, so it's a client component; keep `layout.tsx` and `page.tsx` server components.
- Root `app/layout.tsx` body is `min-h-full flex flex-col` — verify the `100vh` non-scrolling shell composes with it.
- Repo style: tabs, single quotes, one JSX prop per line, Polish UI copy.
- `app/layout.tsx` has an uncommitted change (metadata title → `Hivewise`), and `context/screenshots/`, `context/templates/`, and the spec itself are untracked. Sweep them in when branching.

### Gotcha found while verifying

**Adding a key to `@theme` needs a dev-server restart.** Turbopack hot-swaps changed `:root`
values fine, but a *new* theme key is not registered by an already-running `next dev`. The three
added here — `--color-accent-hover`, `--color-border-2`, `--color-border-3` — silently generated
no utilities in the running server, so `border-border-2` fell back to `currentColor` (the avatar
ring rendered green, the secondary button's ring muted) and both `hover:` tints were inert. A
fresh compile and `next build` both emit all of them correctly. If the dashboard ever looks like
its hairlines are the wrong colour, restart `next dev` before debugging the CSS.

### Added to scope: responsive / mobile (requested mid-build)

The spec listed "Responsive / mobile layout" as a separate spec. Pulled in anyway — this is a
field tool, and the ask was specifically that **"Przegląd" be easy to tap**. Built mobile-first,
with `lg:` (1024px) restoring the desktop mock exactly.

- **Navigation splits in two.** `NAV_ITEMS` moved to `nav.ts`; `Sidebar` is now `hidden lg:flex`
  and `MobileNav` renders the same destinations as a bottom tab bar below `lg` (56px tall tabs,
  active marker moves from the left edge to the top edge). The bottom bar is a flex sibling of
  `<main>`, not `fixed`, so it can never overlap content.
- **Touch targets.** "Przegląd" 48px tall, "Szczegóły" 44px, topbar buttons 44px, tabs 56px —
  all above the 44px minimum, measured in-browser at 320px and 390px wide. Hive-card buttons
  stack vertically below `lg`; side by side inside a half-width card left them too narrow.
- **Grids.** Hives 2 → 3 (`sm`) → 4 (`lg`). Alerts 1 → 2 (`sm`) → 3 (`lg`); one per row on
  phones because truncating why a hive needs attention defeats the section.
- **Type scale** lifted a step or two below `lg` (10–11px is unreadable outdoors); dots go 9 →
  11px. Everything reverts at `lg`.
- **Topbar** keeps one row on phones: name truncates, location hides below `sm`, "Dodaj ul"
  collapses to a 44×44 icon button with an `aria-label`.
- **`h-dvh`, not `h-screen`**, and the 640px `min-h` floor is now `lg:`-only. Both matter on
  phones: `100vh` counts the collapsing URL bar, and a 640px floor pushed the tab bar off a
  390px-tall landscape screen.
- **`viewportFit: 'cover'`** added to the root layout so the tab bar's
  `pb-[env(safe-area-inset-bottom)]` clears the iOS home indicator; without it `env()` is 0.
- **`prefetch={false}`** on the nav links — the router was prefetching `/analytics` and
  `/settings`, which don't exist yet, giving two console 404s per load. Marked TODO; drop it
  when those routes land.

**Verified at 320 / 390 / 768 / 844×390 / 1440:** no horizontal scroll and no element past the
viewport at any width, desktop pixel-unchanged, console clean.

## History

### Prisma 7 + Neon PostgreSQL Setup — completed 2026-08-28

Phase 1 database foundation. Prisma 7.10.0 (pinned exact) wired to Neon Postgres, the full domain schema, and a hot-reload-safe client singleton. Merged to `main` as `ba3b6bd`.

**Delivered**

- `prisma/schema.prisma` — `User`, `Subscription`, `UsagePeriod`, `Apiary`, `Hive`, `Inspection`, `PdfGenerationJob`, `AiReport`, plus Auth.js `Account` / `Session` / `VerificationToken`; five enums; cascade deletes down the user → apiary → hive → inspection → pdf job chain; `@@index([hiveId, inspectedAt])` and friends.
- `prisma.config.ts` — v7 config, loads `.env.local` explicitly so the CLI and Next.js share one env file; prefers `DIRECT_DATABASE_URL` for migrations when set.
- `app/lib/prisma.ts` — `PrismaClient` through the `@prisma/adapter-pg` driver adapter behind a dev-safe global singleton.
- Migration `20260828141044_init` applied to the Neon **development** branch (`br-old-bonus-b1yjip8c`). Production branch untouched.
- Scripts: `db:migrate`, `db:deploy`, `db:studio`, and `postinstall` → `prisma generate`.

**Decisions worth remembering**

- **It's Prisma 7, not 8.** The spec was titled "Prisma 8" but every requirement in it described Prisma 7 — and `@prisma/client` has no 8.x release at all (the `8.0.0-rc` exists only for the CLI package). Prisma 8 is a rewritten ORM: no `PrismaClient`, no driver adapters, contract-based schemas, TS graph migrations, and no published Neon or Vercel guidance. Prisma's own docs still call 7 the right choice for production.
- **`@prisma/adapter-pg`, not `adapter-neon`** — direct TCP against Neon's *pooled* endpoint. Neon's pooler does the real pooling, so each serverless instance keeps `max: 5`. Revisit only if edge runtime is needed.
- **`connectionTimeoutMillis: 10_000` is explicit.** Driver adapters inherit node-postgres' default of `0` (never time out), unlike pre-v7 Prisma's 5s — a half-open socket would otherwise hang a request forever, the exact field-connectivity failure this phase exists to fix.
- **`sslmode=verify-full`, never `require`.** node-postgres treats them identically today, but pg v9 switches `require` to libpq semantics that skip certificate verification. Use `verify-full` in Vercel's production variable too.
- **`Hive.currentInspectionId` is `onDelete: SetNull`** — deleting an inspection must not delete the hive. Forms a two-table FK cycle with `Inspection.hive`, which Postgres permits.
- **Auth.js fields stay snake_case** (`refresh_token`, …) — `@auth/prisma-adapter` binds to those column names.
- **Client output is `generated/prisma` at the repo root**, not `src/generated/prisma`; this repo has no `src/`. Gitignored, rebuilt by `postinstall`.
- **`vitest.config.mts` aliases `@` to the project root.** Vite ignores tsconfig `paths`, so any suite importing the Prisma singleton failed to resolve the generated client.

**Verified:** full `User → Apiary → Hive → Inspection → PdfGenerationJob` round trip against the live dev branch (JSON section columns, derived scalars, the denormalized pointer, the indexed history query, and cascade deletes), plus TLS certificate validation via `socket.authorized`. `tsc --noEmit`, `eslint`, `vitest run` (189 tests) and `next build` all green.

**Left open:** `DATABASE_URL` for the Neon **production** branch still needs adding to the Vercel project settings before the first deploy.

**Follow-ups noted, not done:** `context/coding-standards.md` still carries a stale Sanity/monorepo section and assumes a `src/` directory this repo doesn't have.

### Demo User Seed Script — completed 2026-08-28

Idempotent `prisma db seed` that stands up a full demo account. Merged to `main` as `2f7f687` (feature commit `5e8db37`).

**Delivered**

- `prisma/seed.ts` — `demo@getapiary.app` / Jan Pszczelarz (bcrypt of `demo1234`, 10 rounds), `PREMIUM` + `active` subscription with all Stripe fields null, current-month `UsagePeriod` (3 PDFs / 1 AI report), `Pasieka Turawa` apiary, and five `WIELKOPOLSKI` hives `Ul 1`–`Ul 5`. All five steps in one interactive transaction, each logging a `[seed] …` line.
- `prisma.config.ts` — `migrations.seed: 'tsx prisma/seed.ts'`.
- `package.json` — `db:seed` script; `bcryptjs@3.0.3` and `tsx@4.23.12` added as devDependencies.

**Decisions worth remembering**

- **`migrations.seed` in `prisma.config.ts`, not the `package.json` `"prisma"` key.** The v7 location; the old key is silently ignored.
- **No `@types/bcryptjs`.** `bcryptjs@3` ships its own declarations. The DefinitelyTyped package is stale v2 defs that shadow them — installed it, then removed it.
- **Interactive `$transaction(async (tx) => …)`, not the array form.** The array form dispatches every promise before any resolves, so ordered per-step logging is impossible with it. Timeouts raised to `{ maxWait: 10_000, timeout: 20_000 }` — the 2s/5s defaults are too tight for a cold Neon compute.
- **`process.exitCode = 1`, never `process.exit(1)` in the `.catch`.** `process.exit` terminates before `.finally` can run `$disconnect()`, leaking a connection on every failed seed. (The spec's own snippet had this bug.)
- **The seed builds its own `PrismaClient` on `PrismaPg` with `max: 1`** and imports `./generated/prisma/client` relatively. The app singleton in `app/lib/prisma.ts` isn't reusable from a CLI process, and since the schema declares no datasource `url`, an adapter is mandatory even outside Next.js.
- **Seed loads `.env.local` itself via dotenv.** `prisma db seed` inherits env from the CLI process, but `tsx prisma/seed.ts` run directly does not.
- **Existence check, not `upsert`** — a partial seed must never leave a user row without its related records.

**Verified** against the live Neon **development** branch (`br-old-bonus-b1yjip8c`): first run printed the spec's expected stdout (`periodStart` → `2026-08-01`), second run printed only the skip line; SQL confirmed 1/1/1/1/5 rows with no duplicates, correct enum and null-Stripe values, all `currentInspectionId` null, and 0 inspections / PDF jobs / AI reports; a throwaway probe confirmed `bcrypt.compare('demo1234')` → true, wrong password → false, and that a deliberate mid-transaction throw left zero rows. `tsc --noEmit`, `eslint`, `vitest run` (199 tests) and `next build` all green.

**Left open:** `periodStart` uses the spec's literal `now.getFullYear()` / `now.getMonth()` (local getters) inside `Date.UTC`. In UTC+2, seeding between 00:00 and 02:00 local on the 1st yields the new month while `now` is still the previous month in UTC. Harmless for a demo seed; switch to `getUTCFullYear`/`getUTCMonth` if this ever backs real usage-quota logic.
