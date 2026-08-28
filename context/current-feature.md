# Current Feature

## Status

Not Started

## Goals

<!-- Bullet points of what success looks like. Populated by /feature load. -->

## Notes

<!-- Additional context, constraints, or details from the spec. -->

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

### Dashboard Spec 1 — Static Layout — completed 2026-08-28

Post-login dashboard shell at `/dashboard`, built mobile-first with the desktop mock restored at `lg`. All data hardcoded; Spec 2 swaps in the seeded apiary. Merged to `main` as `068497c` (feature commit `995afce`).

**Delivered**

- `app/(dashboard)/layout.tsx` — shell owning the sidebar rail + scrolling `<main>` at `lg`, and `<main>` + bottom tab bar below it. `<main>` is the only scroll container, so each page's topbar sticks to the content rather than the viewport.
- `app/(dashboard)/dashboard/page.tsx` — topbar, page header, 3 alerts, 8 hive cards, all constants.
- `app/components/dashboard/` — `Sidebar`, `MobileNav`, `Topbar`, `AlertCard`, `HiveCard`, `StrengthDots`, `icons.tsx`, plus `nav.ts` (one `NAV_ITEMS` list, two presentations) and `status.ts` (`HiveStatus` / `QueenStatus` / label maps — the contract Spec 2's seeded records must satisfy).
- `app/globals.css` — palette retuned to the reference; `--accent-hover`, `--border-2`, `--border-3` added with `@theme inline` entries.
- `app/layout.tsx` — `viewport` export with `viewportFit: 'cover'` and `themeColor`.

**Decisions worth remembering**

- **A new `@theme` key is not picked up by a running `next dev`.** Turbopack hot-swaps changed `:root` *values* fine, but the three new keys generated no utilities in an already-running server, so `border-border-2` silently fell back to `currentColor` — green avatar ring, muted button ring, dead `hover:` tints. `next build` and a fresh compile emit all of them. **If the hairlines ever look wrong, restart the dev server before debugging the CSS.**
- **Colored card edges are declared per side, never via a `border` shorthand + override.** `AlertCard` sets top/right/bottom explicitly and the accent left separately; `HiveCard` does the same with the accent on top. Hover lightens only the neutral sides, so it can't repaint the amber or red edge. A shorthand `hover:border-border-2` would have.
- **`h-dvh`, not `h-screen`, and the 640px `min-h` floor is `lg:`-only.** `100vh` counts the collapsing mobile URL bar; the floor pushed the tab bar off a 390px-tall landscape phone. Verified at 844×390 — shell exactly 390, tab bar on screen.
- **`viewportFit: 'cover'` is mandatory for the tab bar's `pb-[env(safe-area-inset-bottom)]`** — without it `env()` resolves to 0 and the bar sits under the iOS home indicator.
- **Touch targets sized for gloved, one-handed outdoor use:** "Przegląd" 48px, "Szczegóły" and topbar buttons 44px, tabs 56px. Card buttons stack below `lg`; side by side inside a half-width card left each ~66px wide.
- **Spec vs. template, resolved deliberately:** template wins on look (palette, nav icons, `Dashboard` as the first nav item — the spec's `/apiary` list left nothing active on `/dashboard`); spec wins on its explicit callouts (`Hivewise` wordmark, green `Premium` badge). Components live in `app/components/dashboard/`, not the spec's root `components/`, per repo convention.
- **Empty `StrengthDots` border uses `--subtle`** (template) rather than the spec's `--surface-3`; after the retune those are no longer the same value and `--subtle` stays legible.
- **Tailwind canonical spacing steps over arbitrary px** (`gap-2.25`, not `gap-[9px]`) — the project's IntelliSense flags the arbitrary forms. Same output.
- **The badge was left inline in `AlertCard`** rather than extracted as the `Badge` component the spec's markup implies: seven classes used once.

**Verified** on the production build at 320 / 390 / 768 / 844×390 / 1440: no horizontal scroll and no element past the viewport at any width; sidebar exactly 192px and pinned through a scroll; `<main>` the only scroll container; topbar `sticky`/`z-10`; grids 4/3 at `lg`, 2/1 on phones; every border read side-by-side (hive 4 = `2px red / 0.06 / 0.06 / 0.06`, lifting to `0.1` on hover with the red intact); every touch target measured. `tsc --noEmit`, `eslint`, `prettier`, `vitest run` (199 tests) and `next build` all green; `/dashboard` prerenders static.

**Left open:** `prefetch={false}` on the nav links is a TODO — the router was prefetching `/analytics` and `/settings`, which don't exist yet, as two console 404s per load. Drop it when those routes land. The sidebar footer (avatar / name / plan) has no mobile equivalent; `Ustawienia` covers it for now. Hive grid is 2-up on phones — trades card width for fewer scrolls; a one-line change if 1-up is preferred.
