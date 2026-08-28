# Current Feature

Auth Phase 1 — NextAuth v5 + Google OAuth

## Status

In Progress

## Goals

- `next-auth@beta` (v5) + `@auth/prisma-adapter` installed, wired to the existing Prisma singleton, JWT session strategy.
- Google OAuth sign-in works end to end: `/dashboard` while signed out redirects to NextAuth's default sign-in page; "Sign in with Google" returns to `/dashboard` signed in.
- `proxy.ts` at the repo root protects `/dashboard/*`, exported as `export const proxy = auth(...)`.
- `auth()` is callable from server components and returns a session carrying `user.id` — the contract Dashboard Spec 2 is waiting on.
- Session type augmented so `session.user.id` type-checks without a cast.
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` in `.env.local`, with names (not values) mirrored into `.env.example`.
- `tsc --noEmit`, `eslint`, `prettier`, `vitest run` and `next build` green.

## Notes

Spec: [auth-phase-1-spec.md](context/features/auth-phase-1-spec.md). Verified against Next.js 16.2.6's bundled docs and current Auth.js docs.

**Provider changed to Google** (user decision, supersedes the spec's GitHub). Everything structural in the spec is unaffected — only the provider import, the two env var names, and the OAuth app registration differ. Google is also the better fit technically here; see below.

### Blocking: the `User` model cannot accept an OAuth sign-in

`PrismaAdapter.createUser` writes only Auth.js's own fields. Against the current schema, the first Google sign-in fails. A migration has to land before anything else in this phase can be tested:

- **`passwordHash String` is NOT NULL with no default.** The adapter never supplies it → Postgres not-null violation on `createUser`. Must become `String?`. Phase 2 ("add password field via migration if not already there") assumes this column exists; making it nullable is what lets OAuth-only and credentials users coexist in one table.
- **No `emailVerified DateTime?`** — a required field in Auth.js's canonical `User`. The adapter reads and writes it.
- **No `image String?`** — same, and Phase 3 explicitly wants an avatar with an initials fallback in the sidebar, so it is needed regardless. Google supplies `picture`.

Note this is required even though the spec chooses `strategy: 'jwt'`. JWT skips `createSession` / `getSessionAndUser`, but `createUser`, `linkAccount` and `getUserByAccount` still run through the adapter on every first sign-in.

**Google makes the `email String @unique` non-null column safe.** Auth.js's canonical `User.email` is nullable; this repo's is not. That would have been a real failure mode with GitHub, where a user can hide their email. Google always returns an email plus an `email_verified` claim, so a non-null column is fine — one less thing to migrate. Worth keeping in mind if a provider without that guarantee is ever added.

### The spec's file paths assume a `src/` directory that doesn't exist

Every path in "Files to Create" is `src/`-prefixed. This repo has no `src/`; `app/` sits at the root and `tsconfig.json` maps `@/*` → `./*`. Translation:

| Spec | This repo |
| --- | --- |
| `src/auth.config.ts` | `auth.config.ts` (root) |
| `src/auth.ts` | `auth.ts` (root) |
| `src/app/api/auth/[...nextauth]/route.ts` | `app/api/auth/[...nextauth]/route.ts` |
| `src/proxy.ts` | `proxy.ts` (root) |
| `src/types/next-auth.d.ts` | `types/next-auth.d.ts` (new dir) |

Root is correct for `proxy.ts` specifically — the Next 16 docs require it "at the same level as `pages` or `app`". `app/api/auth/[...nextauth]/` is new; the only existing route is `app/api/generate-pdf/route.ts`. `types/` does not exist yet, and `tsconfig` `include` already covers `**/*.ts`, so a new top-level `types/` needs no config change.

Worth settling on the way in: a root `auth.ts` breaks the convention that shared modules live in `app/lib/` (where `prisma.ts` is). But Auth.js docs and both later phases say `@/auth`, and `proxy.ts` importing from `app/lib/` is odd since proxy lives outside `app/`. Recommend following the spec — root `auth.ts` / `auth.config.ts` — and staying consistent across all three phases rather than optimizing this one file.

### The split-config rationale is obsolete in Next 16 (the pattern still isn't wrong)

The spec asks for the split "for edge compatibility". That reason no longer holds:

- Next 16's bundled docs: *"Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in Proxy will throw an error."*
- Auth.js's own edge-compatibility guide now scopes the problem to *"Next.js versions prior to 16"*.

So Prisma-over-TCP in `proxy.ts` would actually run. Still do the split — it keeps the Prisma client and the `pg` driver out of a file that executes on every matched request, which the Next docs warn against for exactly this reason (*"only read the session from the cookie… avoid database checks"*). Just record the real justification (request-path weight) rather than the stale one (edge runtime), so nobody later "fixes" it back.

### Google specifics

- **Env vars are `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.** Auth.js infers these from the `AUTH_<PROVIDER>_ID|SECRET` convention, so `Google` needs no explicit `clientId` / `clientSecret` — just `providers: [Google]`.
- **Callback URL is `http://localhost:3000/api/auth/callback/google`** in the Google Cloud Console OAuth client (type: Web application). Production needs its own entry. Google accepts `http://localhost` but rejects plain `http://` for any other host.
- **The OAuth consent screen must be configured before the client works,** and while it is in "Testing" status only explicitly listed test users can sign in. Add the demo account there or the first sign-in fails with `access_denied` for reasons that have nothing to do with the code.
- **Do not add the `access_type: 'offline'` / `prompt: 'consent'` refresh-token dance.** Auth.js documents it, but it exists for calling Google APIs on the user's behalf, which this app never does — and `prompt: 'consent'` forces the consent screen on *every* sign-in. Plain `Google` is right here. The `Account.refresh_token` column simply stays null.
- Google returns `email_verified` in the profile. A `signIn` callback could gate on it, but Google only issues verified emails for standard accounts — not worth adding in Phase 1.

### Verified compatibility

- `next-auth@beta` is `5.0.0-beta.32`; peer range `next: ^14 || ^15 || ^16`, `react: ^18.2 || ^19`. Compatible with `next@16.2.6` / `react@19.2.4`. The spec is right that `@latest` installs v4 (`4.24.15`) — use `@beta`.
- `@auth/prisma-adapter` is `2.11.3`. Peer `@prisma/client` is `>=2.26.0`, which `7.10.0` satisfies. **But** it is built and tested against Prisma 6 (its own devDependency), and this project generates the client to `generated/prisma` rather than `@prisma/client`. If `PrismaAdapter(prisma)` produces a type error, that mismatch is the cause — not a version conflict.
- Named `export const proxy = auth(...)` is confirmed valid: the Next 16 docs accept a default export or a named `proxy` export, and Auth.js's migration guide shows this exact form.

### Smaller things

- **`.env.local` is gitignored (`.env*`), `.env.example` is not.** Add the three new key names to `.env.example` with empty values; never the secrets. Generate `AUTH_SECRET` with `npx auth secret`.
- **This phase strands the demo user.** `demo@getapiary.app` exists with a `passwordHash` and no linked OAuth account, and it owns the only seeded apiary and its 5 hives. Signing in with Google creates a *different* user with no apiary, so `/dashboard` will hit Dashboard Spec 2's `apiary === null` path — which redirects to an `/onboarding` route that doesn't exist. Expected for Phase 1 (credentials arrive in Phase 2), but decide what a fresh OAuth user sees so the happy path isn't a 404. Cheapest stopgap: sign in to Google with the seeded address, or re-point the seed at the Google account's email so the demo data is reachable.
- **Don't set `pages.signIn`** — the spec is explicit that Phase 3 replaces the default page. Leaving it default now gives Phase 3 one place to change.
- **`proxy.ts` matcher**: scope to `/dashboard/:path*` per the spec. Auth.js's general advice is to run proxy on all routes, but that would also intercept `/` and `/api/generate-pdf`, which are public today.
- **No existing `proxy.ts` or `middleware.ts`** to migrate — this is a clean first one.
- The spec's Testing step 2 says "Sign in with GitHub"; read it as Google.

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
