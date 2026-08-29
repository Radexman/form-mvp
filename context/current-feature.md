# Current Feature: Auth Phase 3 — Sign In, Register & Sign Out UI

## Status

In Progress

## Goals

- `/sign-in` — custom page, split in two: an apiary image with an overlay and welcoming text on one side, the credentials form plus "Sign in with Google" on the other. Field-level validation and error display. Links to `/register`.
- `/register` — same split layout. Name, email, password, confirm password. Validation (email format, passwords match). Posts to `/api/auth/register`, redirects to `/sign-in` on success.
- A reusable avatar component: Google `image` when the user has one, initials from the name otherwise.
- Sidebar footer uses that avatar; tapping it opens a dropdown (upward) containing "Sign out". The avatar itself links to `/profile`.
- The same avatar and dropdown in the mobile top bar below `lg`, so sign-out works on phones for the first time.
- Every redirect to next-auth's default `/api/auth/signin` points at `/sign-in` instead.

## Notes

Spec: `context/features/auth-phase-3-spec.md` (the Mobile Top Bar section was added on user request before starting).

- Phase 2 left explicit Phase-3 markers to clean up: `auth.ts:34`, `app/components/dashboard/Sidebar.tsx:84`, and the two `redirect('/api/auth/signin')` calls in `app/(dashboard)/layout.tsx:35` and `app/(dashboard)/dashboard/page.tsx:39`.
- Already built and reusable: `signInSchema` / `registerSchema` in `app/lib/auth.schema.ts` (Polish messages, `z.flattenError` for field-keyed errors), `POST /api/auth/register`, `signOutAction` in `app/lib/auth-actions.ts`, `formatInitials` in `app/lib/dashboard.ts`.
- **No apiary photo exists** — `public/` holds only the Next.js starter SVGs. The image half needs an asset decision.
- `/profile` does not exist. The spec only asks the avatar to link there; the route itself is out of scope.
- Phase 2 shipped with **no tests**. `auth.schema.ts` and the register route are still uncovered — fold into `/feature test`.
- Two recurring traps from earlier phases: a new `'use server'` module and new `@theme` keys are both invisible to a running `next dev`. Restart the server after adding either.
- UI copy is Polish throughout the dashboard; these pages should match.

### Decisions taken while implementing

- **The avatar is the menu trigger; `/profile` is an item inside the menu.** The spec asks for both a dropdown on avatar click and a click-through to `/profile`, which one element cannot do. `/profile` does not exist yet, so the link carries `prefetch={false}` the way the `/analytics` and `/settings` nav links do.
- **The mobile account menu reads the session in `Topbar` itself** rather than being threaded from the page. It is a JWT cookie decode, not a query.
- **`pages.signIn` lives in `auth.config.ts`, not `auth.ts`** — the redirect that matters is the one the `authorized` callback triggers, and that runs on the Proxy instance built from that file alone.
- **`next.config.ts` had a dead `module.exports`**; `allowedDevOrigins` was never in effect. Folded into the real default export alongside the new `images.remotePatterns` for Google avatars.
- **Sign-in posts through react-hook-form + a server action**, matching the inspection form, rather than `useActionState`. Register posts to the existing `/api/auth/register` because the spec says so and because 409 vs 400 needs real status codes.
- **`safeCallbackUrl` is new and tested** — Proxy puts a `?callbackUrl=` on the redirect, and handing that to `redirectTo` unchecked would be an open redirect.
- **Left panel copy is vertically centred**, on user request mid-implementation.

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

### Auth Phase 1 — NextAuth v5 + Google OAuth — completed 2026-08-28

Auth.js v5 with the Prisma adapter, JWT sessions, and Google OAuth protecting `/dashboard/*`. Provider switched from the spec's GitHub to Google by user decision. Merged to `main` as `a497ad9` (feature commit `f8379db`).

**Delivered**

- `auth.config.ts` — provider list + the `authorized` callback. `auth.ts` — same config plus `PrismaAdapter`, `session.strategy: 'jwt'`, and `jwt` / `session` callbacks that carry `user.id`.
- `proxy.ts` (repo root, level with `app/`) — `export const proxy = auth`, `matcher: ['/dashboard/:path*']`.
- `app/api/auth/[...nextauth]/route.ts`, `types/next-auth.d.ts`.
- Migration `20260828201002_auth_user_oauth_fields` — `passwordHash` → nullable, `emailVerified` and `image` added. Applied to the Neon **development** branch.
- `next-auth@5.0.0-beta.32` and `@auth/prisma-adapter@2.11.3`, both pinned exact per the Prisma convention.

**Decisions worth remembering**

- **`callbacks.authorized` is what protects routes — without it nothing is protected.** next-auth defaults `authorized` to `true`, so a bare `export const proxy = auth` attaches `req.auth` and lets every request through. `/dashboard` returned 200 until the callback existed. **And the export must stay bare:** in `next-auth/lib/index.js` the `userMiddlewareOrRoute` branch is checked *before* `!authorized`, so wrapping it as `auth(fn)` suppresses next-auth's built-in redirect to `/api/auth/signin?callbackUrl=…`.
- **Augment `@auth/core/jwt`, not `next-auth/jwt`.** Auth.js's docs say the latter, but on this version `next-auth/jwt` is a bare `export * from "@auth/core/jwt"` — augmenting a re-exporting module declares a second, unused `JWT` instead of merging, leaving `token.id` as `unknown` (which narrows to `{}` under a truthiness check).
- **`prisma migrate dev` applied the migration but did NOT regenerate the client**, while reporting success. The generated client kept `passwordHash` required and had no `emailVerified` / `image` at all, so `PrismaAdapter.createUser` failed with `Argument 'passwordHash' is missing` — a Prisma-client validation error that never reached Postgres. **No gate could catch this:** `tsc`, `eslint` and `next build` all passed, because no app code references those fields and `PrismaAdapter(prisma)` is loosely typed. Only a real sign-in surfaced it. Fix: explicit `npx prisma generate` plus `rm -rf .next/dev` so Turbopack drops the bundled stale client. **Run `prisma generate` explicitly after any schema change.**
- **The split config is right, but not for the documented reason.** Next 16 runs Proxy on the Node.js runtime (`runtime` config throws), and Auth.js now scopes the edge problem to "versions prior to 16". Prisma in `proxy.ts` would work. The split stays because Proxy runs ahead of every matched request and the Next docs say to read the cookie, not the database.
- **`...authConfig.callbacks` must be spread inside `auth.ts`'s `callbacks`** — a bare `callbacks: {…}` after `...authConfig` replaces the object wholesale and silently drops `authorized`.
- **No `access_type: 'offline'` / `prompt: 'consent'`.** Refresh tokens exist for calling Google APIs on the user's behalf, which this app never does, and `prompt: 'consent'` would force the consent screen on every sign-in. `Account.refresh_token` stays null by design.
- **`allowDangerousEmailAccountLinking: true`** — safe specifically because Google verifies every email it returns. Currently dormant (no Google account matches `demo@getapiary.app`); it exists so Phase 2 credentials users can also sign in with Google.
- **Google removes the need to make `User.email` nullable.** Auth.js's canonical `User.email` is optional; this repo's is `String @unique`. That would have been a live failure with GitHub, where users can hide their address.
- **Provider takes no arguments** — Auth.js infers `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` from the `AUTH_<PROVIDER>_*` convention.
- **Spec paths were all `src/`-prefixed; this repo has no `src/`.** Everything moved to the root or `app/`. `proxy.ts` at the root is required by Next, not a preference.

**Verified** end to end against the Neon **development** branch: Google consent created `borderlandsmaniak@gmail.com` with `image` set and `passwordHash` null, linked one `google` / `oidc` `Account` with an `access_token` and no refresh token, wrote **zero** `Session` rows (confirming the JWT strategy), and left the seeded demo user and its apiary untouched. Signed out, `/dashboard` 307s to `/api/auth/signin?callbackUrl=…` while `/` and `/api/generate-pdf` stay public. The client ID and redirect URI were also validated directly against Google's authorize endpoint. `tsc --noEmit`, `eslint`, `prettier`, `vitest run` (199 tests) and `next build` all green.

**Left open:** a fresh Google user has no apiary, so once Dashboard Spec 2 lands they hit its `apiary === null` → `/onboarding` redirect, and that route does not exist. Accepted deliberately: only the demo user shows seeded data for now. Until Spec 2, `/dashboard` renders Spec 1's static mock for any signed-in user, so Phase 1's happy path is clean. `AUTH_SECRET` and the two Google values are in `.env.local` only; Vercel still needs them, plus a production redirect URI on the OAuth client. The consent screen is in **Testing** status — only listed test users can sign in. No sign-out UI yet (Phase 3). `emailVerified` stays null: the Prisma adapter only sets it for email-link flows, not OAuth.

### Auth Phase 2 — Credentials (Email/Password) Provider — completed 2026-08-28

Email/password sign-in alongside Google OAuth, the registration endpoint behind it, and a sidebar sign-out button. Merged to `main` as `dcf9c47` (feature commit `2a3f819`).

**Delivered**

- `app/lib/auth.schema.ts` — `signInSchema` / `registerSchema` with Polish messages, shared by the route handler and the `authorize` callback so both sides of the wire enforce one set of rules.
- `auth.config.ts` — Credentials placeholder (`authorize: () => null`); `googleProvider` exported so `auth.ts` reuses it by reference instead of redeclaring its options.
- `auth.ts` — the real `authorize`: Prisma lookup, `bcrypt.compare`, `null` on every failure path.
- `app/api/auth/register/route.ts` — `POST /api/auth/register`.
- `app/lib/auth-actions.ts` + `Sidebar` — `signOutAction` in a `<form>` at the sidebar footer, with a `SignOutIcon` added to `icons.tsx`. Added on user request mid-feature; Phase 3 folds it into the avatar dropdown.
- `package.json` — `bcryptjs` moved from devDependencies to dependencies.

**No migration.** `User.passwordHash` was already nullable from `20260828201002_auth_user_oauth_fields`, exactly as the load notes predicted.

**Decisions worth remembering**

- **A new `'use server'` module is not picked up by a running `next dev`.** The action goes unregistered on the server while the client renders and posts its `$ACTION_ID`, so sign-out died with `Cannot read properties of undefined (reading 'apply')` pointed at `<Sidebar />` — a null-looking error with nothing wrong in the code. A fresh server ran the same action in 10ms. **Restart the dev server after adding a server action.** Direct sibling of Spec 1's `@theme` lesson.
- **Never run two `next dev` processes on this project.** They share one `.next` directory and corrupt each other. Clearing `.next/dev` under a live server is what turned the staleness above into a hard failure.
- **Email is normalised *before* it is validated** — `z.string().trim().toLowerCase().pipe(z.email(…))`. Zod v4 runs the format check ahead of chained transforms, so `z.email().trim()` rejects a pasted address with a trailing space. The lowercasing is not cosmetic: `User.email` is `@unique` and Postgres compares case-sensitively, so without it `Jan@…` and `jan@…` are two rows and whoever capitalised at registration could never sign in.
- **`providers` is overwritten after `...authConfig`, deliberately** — the opposite of `callbacks`, where overwriting silently drops `authorized`. The placeholder in `auth.config.ts` can never sign anyone in, which is harmless because `config.matcher` never routes `/api/auth/*` through Proxy.
- **`authorize` returns `null`, never throws.** A throw surfaces as `CallbackRouteError` (a server fault); `null` gives one `CredentialsSignin` for every failure, so an unknown address, an OAuth-only account and a wrong password are indistinguishable. It also returns named fields rather than the row, so `passwordHash` cannot reach the JWT.
- **Registration 409s on a taken address instead of setting a password on the existing row.** Doing the latter would hand a Google user's account to anyone who knows their email. Linking only runs the other way, via `allowDangerousEmailAccountLinking` on a verified Google sign-in.
- **The 409 leaks account existence, accepted knowingly.** A register endpoint cannot both create the account and hide the collision, and a vague error strands someone who forgot they had signed up. Sign-in stays generic. `P2002` is caught for the race the existence check cannot close.
- **No auto-sign-in after registration** — Phase 3's spec says redirect to sign-in, and minting a session from a plain route handler would bypass Auth.js's own callbacks.
- **Zod, matching the eight existing `*.schema.ts` files**, with `z.flattenError` giving Phase 3's form field-keyed messages.
- **`/api/auth/register` resolves ahead of `[...nextauth]`** — the App Router matches static segments before a catch-all. Confirmed in the build output, where both appear as separate routes.
- **Sign-out is a server action in a `<form>`, not an `onClick`** — `auth.ts` pulls in Prisma, so a client component may only hold a reference to the action, and a GET that destroys a session is a CSRF hazard.

**Verified** against the Neon **development** branch: registration normalised `  TEST@Test.com ` to `test@test.com` and stored a `$2b$10$` hash at cost 10 (matching the seed), then answered 409 duplicate, 409 against the Google account, 400 field errors, 400 malformed JSON and 405 on GET. Sign-in reached `/dashboard` for both the seeded demo account and a new registration, including with an uppercased address; wrong password, unknown address and the `passwordHash`-null Google account all failed identically as `CredentialsSignin`. Zero `Session` rows, one Google `Account`, seed untouched. In the browser at 1440×900: signed in through the form, clicked sign-out → `POST /dashboard 303` → `signOutAction()` in 10ms → `/`, and `/dashboard` bounced back to sign-in. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (199 tests) and `next build` all green.

**Left open:** **no tests were written** — `/feature test` was skipped, so `auth.schema.ts` (the email pipe, the byte-length rule, the confirm-password refinement) and the register handler's branches have no unit coverage despite being the most testable code in the feature. Everything above was verified by hand instead. Registration is still curl-only — no `/register` or `/sign-in` page until Phase 3, so a new user has to sign in through next-auth's default page. That page also warns about missing `autocomplete` attributes; Phase 3 replaces it. Sign-out is desktop-only, since the sidebar footer has no mobile equivalent. Password rules are minimum 8 characters and at most 72 bytes (bcrypt's silent truncation point) with no complexity requirement. No rate limiting on either the register route or credentials sign-in — the obvious next hardening step. Timing still distinguishes a known address from an unknown one, since bcrypt only runs when a hash exists; the 409 already leaks the same fact, so closing one without the other buys nothing.

### Dashboard Spec 2 — Real Data from Database — completed 2026-08-29

`/dashboard` now renders the signed-in user's own apiary from Postgres, keeping Spec 1's layout. Merged to `main` as `1d30ff0` (feature commit `e55f5dd`).

**Delivered**

- `types/inspection.ts` — all six `Json` columns typed by **deriving from the form schemas that write them** (`QueenValues`, `ColonyValues`, …) rather than hand-copying the spec's interfaces, plus `HiveWithCurrentInspection` / `ApiaryWithHives` payload types.
- `app/lib/dashboard.ts` — every derivation as a pure function with `now` injected: status, alert description, strength, date and greeting formatting, name helpers, Polish plural helpers, `latestInspectionDate`.
- `app/lib/dashboard.test.ts` — 37 tests. Suite total 199 → 236.
- `app/(dashboard)/dashboard/page.tsx` — one `findUnique` with a nested include, derive, render; empty state when the user has no apiary.
- `app/(dashboard)/layout.tsx` — now async: session guard plus a `Subscription.tier` lookup for the sidebar footer.
- `Sidebar` takes `userName` / `userInitials` / `isPremium`; `HiveCard` takes a string `label` and a nullable `queenStatus`; `Topbar` drops its separator when an apiary has no location.

**Decisions worth remembering**

- **The spec's `ColonyData` was wrong in two ways, and deriving the types is what caught it.** `colony` carries no `honey_stores` or `honey_kg` — those are the scalar columns `honeyKg` / `honeySufficiency`, computed server-side from the comb frames — and `frames_covered` validates to **0–20**, not 0–10. `payload.ts` is the authority on what actually reaches each column.
- **Strength scales across 0–20, and never returns 0 for an inspected colony.** The spec's halving assumes a range the form does not enforce, so a 12-frame colony would render identically to a 20-frame one. Zero dots is reserved for "never inspected", which must not look like a weak colony.
- **`orderBy: { createdAt: 'asc' }` alone is nondeterministic here.** The seed creates all five hives inside one transaction, so Postgres' `now()` stamps them identically and the sort has no tiebreaker — the grid silently reshuffled to `Ul 5, 1, 2, 3, 4` the moment four rows were updated. `label` is now a secondary sort. Found by testing, not by reading; it would never have appeared on a freshly seeded database. **Lexicographic, so `Ul 10` sorts before `Ul 2`** — a natural sort is needed once labels reach double digits.
- **Empty state, not the spec's `redirect('/onboarding')`.** That route does not exist and three live accounts reach the branch (both Google users, and the production demo account). A redirect would have shipped a 404 as the happy path for every new sign-up.
- **`HiveStatus` stays three-valued.** The spec adds `'never_inspected'` and then says treat it as `'ok'`; a fourth member would have to be handled by `CARD_TOP_EDGE`, `STATUS_DOT` and `StrengthDots.FILLED_BY_STATUS`. "Never inspected" is carried as `queenStatus === null`, which had to exist anyway, and the card mutes both the dot and the label so an uninspected hive cannot be misread as healthy.
- **Derivations live in `app/lib/dashboard.ts`, not inline in the page.** The spec says "in the page component, not in child components"; the half that matters is that no component derives anything. A function nested in a server component cannot be unit-tested, and these branches only fire on data the seed does not contain.
- **`flatMap` over `filter` + `map` for the alert list** — inside the non-`'ok'` branch TypeScript narrows `status` to `AlertVariant` on its own, so `variant` needs neither a cast nor a type predicate.
- **`now` is captured once per render** and threaded through every derivation, so two calls either side of midnight cannot disagree about what is overdue.
- **Greeting and dates are pinned to `Europe/Warsaw`**, not Vercel's UTC, and the hour uses `hourCycle: 'h23'` — `hour12: false` renders midnight as "24" in some ICU versions, which would read as the evening greeting at 00:30.
- **Polish plurals are computed, not hardcoded** — `Intl.PluralRules` gives 1 ul / 2–4 ule / 5+ uli, the matching verb (`wymaga` vs `wymagają`), and adjective agreement for the hive-type line.
- **`/dashboard` is dynamic now** (`ƒ`), where Spec 1 prerendered it. Reading the session forces that; it is expected, not a regression.

**Verified** against the Neon **development** branch. Seeded state: `5 uli · brak przeglądów · 0 wymaga uwagi`, `5 uli wielkopolskich`, five cards with empty dots, no alerts section, sidebar `JP` / `Jan P.` / `Premium` — every acceptance criterion the spec lists, with its demo address corrected. With temporary inspections covering every branch (created, checked, deleted): a missing queen produced a red `Alarm` whose reason beat the swarm cells on the same hive, `not_seen_brood_ok` produced amber, a 30-day-old inspection produced `Przegląd przeterminowany · 30 dni`, and 16/8/12/20 frames produced 4/2/3/5 dots. A throwaway account with no apiary rendered the empty state with a muted `Free` badge, confirming the no-subscription branch. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (236 tests) and `next build` all green.

**Left open:** **production still shows the empty state** — the prod demo account was created through `/api/auth/register`, so it has no subscription, apiary or hives, and the prod Google user has none either. Backfill with `db:create-account` or the seed before demoing prod. `/onboarding` still does not exist, so nothing turns the empty state into an apiary; `Dodaj ul` and `Nowy przegląd` remain inert, as do `Szczegóły` and `Przegląd`. The mobile layout has no sidebar footer, so name, plan and sign-out are desktop-only. Hive labels sort lexicographically. The layout's subscription lookup is a second query per request alongside the page's apiary query — fine at this size, worth folding into one if the shell grows. Google sign-in on prod is still broken pending the `AUTH_URL` / redirect-URI fix recorded in Auth Phase 1.
