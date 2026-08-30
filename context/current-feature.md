# Current Feature: Profile Page

## Status

In Progress

## Goals

- `/profile` renders for the signed-in user, protected and unreachable while signed out.
- Shows account identity: email, name, avatar (Google photo or initials fallback), account creation date.
- Shows usage stats: apiary count and total hive count.
- Shows current plan (Free / Premium) and this month's premium-feature usage — PDF generations and AI reports against their limits.
- Change password, offered only to accounts that have a `passwordHash` (credentials sign-ups), hidden for Google-only accounts.
- Delete account behind a danger zone: a confirmation dialog requiring the user to type an exact phrase, e.g. `DeleteMyAccount`.
- Premium accounts are prevented from self-deleting — exact approach to be agreed with the user before implementing.
- Follows existing patterns: server component + one Prisma query, derivations as pure tested functions in `app/lib/`, route handlers where status codes matter.

## Notes

### Where it lives

`/profile` should be `app/(dashboard)/profile/page.tsx`. The `(dashboard)` group adds no URL segment, so the path is right, and the page inherits the shell, the `auth()` guard and the email-verification gate from `app/(dashboard)/layout.tsx` for free. `UserMenu` already links to `/profile` with a `prefetch={false}` TODO to remove once the route exists.

`proxy.ts` matches only `['/dashboard/:path*']`, so Proxy will not cover `/profile`. The layout's own `auth()` call is the real boundary and is enough, but adding `/profile` to the matcher gives it the same optimistic cookie check the dashboard gets.

`Topbar` takes required `apiaryName` / `location` props and is apiary-shaped. The profile page needs its own header, or the topbar needs to become optional-prop — decide during `/start`. Whatever it is must still carry the `lg:hidden` `UserMenu`, or mobile loses sign-out on this page.

### Already built — reuse, do not rewrite

- **Avatar logic is done.** `app/components/ui/Avatar.tsx` already does Google photo → initials fallback, including recovery from a photo URL that 404s. `formatInitials` / `formatShortName` / `firstNameOf` live in `app/lib/dashboard.ts`. The spec's "Avatar logic" requirement is satisfied by rendering `<Avatar>`.
- **Password rules and the field are done.** `PASSWORD_REQUIREMENTS`, `MIN_PASSWORD_LENGTH` and `resetPasswordSchema` are in `app/lib/auth.schema.ts`; `PasswordField` in `app/components/auth/fields.tsx` renders the reveal toggle and the live requirements checklist. Change-password reuses all of it plus a `currentPassword` field.
- **Ark UI is the dialog library.** `@ark-ui/react` v5 is already a dependency and `UserMenu` uses `Menu.Root` with `lazyMount` / `unmountOnExit`; `Dialog.Root` follows the same shape. No new dependency.
- **Route-handler pattern to copy:** `app/api/auth/reset-password/route.ts` — parse JSON in a try, `safeParse`, `z.flattenError` for field errors, `bcrypt` at `BCRYPT_ROUNDS = 10`, `$transaction` for multi-row writes.

### Data — one query covers the whole page

Everything the page shows hangs off `User`: `email`, `name`, `image`, `createdAt`, `passwordHash` (presence only), `subscription` (`tier` / `status` / `currentPeriodEnd`), the current month's `usagePeriods` row, and `apiary` with `_count: { select: { hives: true } }`.

- **`Apiary.userId` is `@unique` — a user has at most one apiary.** "Total apiaries" is therefore always 0 or 1. Render it honestly (the apiary's name, or "brak pasieki") rather than a count that can only be two values; the `@unique` is documented in `context/project-overview.md` as droppable later.
- **Hive count** is `apiary._count.hives`, not a length — no need to load the rows.
- **`passwordHash` decides the change-password button**, not the provider. Select it and map it to a boolean before it leaves the server component. A `some` on `Account` would miss a Google user who later set a password through the reset flow, which `app/api/auth/reset-password/route.ts` explicitly allows.
- **Usage may be missing.** `/api/auth/register` creates no `UsagePeriod` (only `prisma/seed.ts` and `prisma/create-account.ts` do), so most accounts have none for the current month. Absent must render as 0 used, not as an error or a blank.
- **Limits live in code, not the DB.** `context/project-overview.md` gives working numbers — FREE 15 PDF / 5 AI per month, PREMIUM 50 / 25 — and says explicitly they are configuration, subject to change before launch. Put them in one exported constant, not inline in JSX.
- **Month boundary:** the seed derives `periodStart` with `Date.UTC` and `gen-demo-sql.ts` uses `date_trunc('month', now() AT TIME ZONE 'UTC')`. Match that, and mind the bug the seed left open — use `getUTCFullYear` / `getUTCMonth`, not the local getters.

### Deleting an account

`onDelete: Cascade` from `User` already reaches `Account`, `Session`, `Subscription`, `UsagePeriod`, `AiReport`, and `Apiary` → `Hive` → `Inspection` → `PdfGenerationJob`. A single `prisma.user.delete` is the whole deletion. Two things it does **not** clean up:

- **`VerificationToken` rows are not related to `User`** — that table is keyed by an `identifier` string. Any outstanding `password-reset:<email>` row survives the delete and would still be spendable if the address is re-registered. Delete by identifier in the same transaction.
- **The session cookie is a JWT** and cannot be revoked server-side. The delete must be followed by `signOut()`, or the user keeps a valid-looking cookie pointing at a row that is gone. The `(dashboard)` layout already redirects to `/sign-in` when `findUnique` returns null, so the failure mode is contained, but signing out is the correct finish.

Danger-zone confirmation: exact-match typed phrase before the destructive button enables. Keep the phrase a literal constant shared by the client check and the server check — the server must re-verify it, since the endpoint is reachable without the dialog.

### DECIDED — blocking Premium deletion

**Option 3, chosen by the user on 2026-08-30: block only while a subscription is genuinely active** — `subscription.status === 'active' && subscription.stripeSubscriptionId !== null`. A no-op today (no row satisfies it), so Premium-by-seed accounts including the demo stay deletable; it starts biting the moment Stripe lands in Phase 4. Non-blocked Premium accounts get option 2's wording — the dialog says deleting forfeits the remaining paid period — and still type the phrase. The server re-checks the same condition and answers 409.

Original framing, kept for the record:

The spec says "prevent premium users from deleting their accounts... consult best approaches with me when working." Worth raising before implementing, because **Stripe does not exist yet** — billing is Phase 4 in `context/project-overview.md`, `Subscription.stripeSubscriptionId` is null on every row, and `tier: PREMIUM` today is only set by the seed and `create-account.ts`. So there is no subscription to cancel and nothing that would keep billing a deleted user.

Options to put to the user at `/start`:

1. **Hard block** — Premium users cannot delete; the danger zone says "cancel your subscription first". Simplest, and matches the spec's literal wording. Risk: with no cancel flow built, a Premium user is permanently unable to delete their account, which is a GDPR / consumer-rights problem in the EU — and the demo account is Premium.
2. **Warn, then allow** — the dialog states that deleting forfeits the remaining paid period, and requires the typed phrase anyway. Standard practice, keeps the right-to-erasure path open.
3. **Block only while a subscription is genuinely active** — `status === 'active' && stripeSubscriptionId !== null`, so the block does nothing until Stripe actually lands and Premium-by-seed accounts stay deletable. Revisit with a proper "cancel then delete" flow in Phase 4.

Recommendation is 3 as the shape, with 2's wording. The user's call.

### Other

- Copy is Polish throughout (`Wyloguj się`, `Nie pamiętasz hasła?`, …). Match it.
- Any change-password or delete endpoint should be a **route handler**, not a server action: Next 16 traces server-action arguments in the dev console in plaintext — the reason `/api/auth/reset-password` is a route handler, and the bug `signInAction` still carries.
- No rate limiting exists anywhere in this codebase; a change-password endpoint that verifies a current password is another brute-force surface. Consistent with what is already open, but note it.
- Dev-server staleness traps from previous features apply: restart `next dev` after adding a new `'use server'` module, a new `@theme` key, or an edit to `globals.css`.

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

### Auth Phase 3 — Sign In, Register & Sign Out UI — completed 2026-08-29

Custom `/sign-in` and `/register` replacing next-auth's built-in pages, a reusable avatar, and an account dropdown that finally exists on mobile. Merged to `main` as `7ddc015` (feature commit `e314bd6`).

**Delivered**

- `app/(auth)/` — shared split-screen shell plus both pages. The layout also bounces a signed-in visitor to `/dashboard`: Proxy only matches `/dashboard/*`, so nothing above it turns away someone arriving from a bookmark or the back button.
- `AuthBackdrop` — the drifting honeycomb, wash and scrims. `AuthShowcase` — the `lg`-only brand copy.
- `app/components/auth/` — `SignInForm`, `RegisterForm`, `GoogleButton`, and a small `fields.tsx` vocabulary built on Ark UI's `Field`.
- `app/components/ui/Avatar.tsx` — Google photo, initials fallback, plus recovery from a photo URL that 404s.
- `app/components/dashboard/UserMenu.tsx` — one Ark UI menu in two variants: the sidebar footer row, and an avatar-only trigger in `Topbar` below `lg`.
- `app/lib/callback-url.ts` + 11 tests. Suite 236 → 247.
- `auth.config.ts` gains `pages.signIn`; both `redirect('/api/auth/signin')` calls now point at `/sign-in`.
- `next.config.ts` — `images.remotePatterns` for `lh3.googleusercontent.com/a/**`.
- `context/coding-standards.md` — a new **Comments** rule, on user request.

**Decisions worth remembering**

- **`pages.signIn` belongs in `auth.config.ts`, not `auth.ts`.** The redirect that matters is the one the `authorized` callback fires, and that runs on the Proxy instance, which is built from `auth.config.ts` alone. Putting it in `auth.ts` would leave Proxy still sending people to `/api/auth/signin`.
- **`signIn()` throws on both outcomes.** Success calls `redirect()`, which throws `NEXT_REDIRECT`; failure throws `AuthError`. The catch must return only for `AuthError` and rethrow everything else, or the navigation is swallowed and the form appears to do nothing. Confirmed in `@auth/core`: with `raw` set, `isAuthError && isRaw && !isRedirect` rethrows.
- **Sign-out from a menu item uses `requestSubmit()` on a form rendered *outside* the menu content.** Selecting an item closes the menu, and a submit button the menu is hiding in the same tick is not something to depend on. `lazyMount` + `unmountOnExit` are on for a second reason: below `lg` both `UserMenu` variants mount (the sidebar's inside a `display:none` aside), so the panel markup would otherwise sit in the document twice.
- **The comb is rendered exactly once.** It is an SVG `<pattern>` referenced by `url(#auth-comb)`; the obvious "one backdrop per column" approach would put two elements with the same id in one document. Hence one absolutely positioned layer, `w-full` on phones and `lg:w-1/2` above.
- **The drift travels exactly one pattern tile.** That is what makes the loop seamless — the last frame is pixel-identical to the first, one cell over. `--comb-tile` is set inline from the same constant that builds the pattern, so the keyframes in `globals.css` cannot fall out of step. The svg is a tile wider than its box and offset left by a tile, so `overflow-hidden` on the parent is load-bearing: without it the overhang becomes horizontal page scroll.
- **The avatar is the menu trigger and `/profile` is an item inside it.** The spec asked for both a dropdown on avatar click and a click-through to `/profile`; one element cannot do both.
- **`next.config.ts` had a dead `module.exports = {…}`.** `allowedDevOrigins` was never in effect — the config loader reads the default export, and `export default` compiles to `exports.default` on the object `module.exports` had just replaced. Phone-on-LAN dev access should work now for the first time.
- **`safeCallbackUrl` rejects `/\evil.example` as well as `//evil.example`** — browsers normalise the backslash and read both as another host, and a naive `startsWith('//')` misses the second form.
- **Register posts to the route handler, not a server action.** 409-for-taken vs 400-for-invalid is the contract Phase 2 tested, and the repo's standards put anything needing specific status codes in a route handler.
- **`Topbar` is async and reads the session itself** rather than taking it as a prop, so no page that renders a topbar has to thread the user through. A JWT cookie decode, not a query.

**Verified** in the browser at 1440×900, 1280, 1024 and 390×844 against the Neon **development** branch: empty-form validation, a wrong password producing one generic message, a correct password reaching `/dashboard`, `/dashboard` while signed out redirecting to `/sign-in?callbackUrl=…`, `/sign-in` while signed in redirecting to `/dashboard`, register with mismatched passwords, a duplicate address landing its 409 on the email field, a new account redirecting to `/sign-in?registered=1` with the confirmation banner, and signing in afterwards with the lowercased form of an address registered with mixed case and a trailing space. Sign-out works from both the sidebar and the mobile top bar. A Google avatar loaded through `/_next/image` (32px decoded), and a deliberately broken URL fell back to initials. The drift was measured seamless: `translateX(59.997px)` at 11999ms, `translateX(0)` at the wrap. No horizontal overflow at any width. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (247 tests) and `next build` all green.

**Left open:** **`/profile` does not exist**, so the menu item 404s — it carries `prefetch={false}` like the `/analytics` and `/settings` nav links. **No tests for `auth.schema.ts` or the register route** — Phase 2's gap is still open; only `callback-url.ts` gained coverage. `callbackUrl` deep links are dropped rather than honoured: next-auth writes an absolute URL and `safeCallbackUrl` accepts only relative paths, so everything lands on `/dashboard`. Harmless while `/dashboard` is the only protected page; revisit when `/dashboard/hive/:id` exists. The apiary image half is still CSS art — drop a photo in `public/` and render an `<Image fill>` under the scrims. **The dev server logs sign-in passwords in plaintext** (`ƒ signInAction({"email":…,"password":…})`) — Next 16 traces server-action arguments in dev; switching the action to `FormData` would hide it. Google sign-in on prod is still broken pending the `AUTH_URL` / redirect-URI fix from Auth Phase 1, and production still shows the empty dashboard state. **Turbopack served stale CSS** after an edit to `globals.css` and needed a dev-server restart — add that to the `@theme` and `'use server'` staleness list.

### Email Verification — Resend — completed 2026-08-29

Registration now mails a verification link and `/dashboard` stays closed until it is clicked. Merged to `main` as `fa54d60` (feature commit `fb33b8b`).

**Delivered**

- `app/lib/email/` — `verification-token.ts` (generation, 24h expiry, `resolveAppUrl`, URL building) with 19 tests; `resend.ts` lazy client; `send-verification-email.ts`; `issue-verification.ts`, the shared write-then-send step; `verification-actions.ts` with both re-send actions. Suite 247 → 266.
- `app/api/auth/verify-email/route.ts` — consumes the link; every outcome redirects to `/sign-in` with `verified=true`, `verified=already` or `error=invalid_token`.
- `app/(auth)/(anonymous)/register/check-email/page.tsx` and `app/(auth)/verify-email/page.tsx`, both with a re-send button; `ResendVerificationButton`, `SignOutButton`, `MailIcon`.
- `auth.ts` — `events.linkAccount` stamps `emailVerified` for Google. `app/(dashboard)/layout.tsx` — the gate, folded into the existing subscription query.
- Migrations `20260829120000_add_email_verification` and `20260829130000_backfill_email_verified`. Applied to **both** Neon branches.
- `public/email/comb-backdrop.png` — the auth honeycomb rasterised for the email.

**Decisions worth remembering**

- **The spec's two token rules contradict each other.** "Consume the token" and "second click → `verified=already`" cannot both hold: nulling it makes the second click indistinguishable from a forged one, which the first implementation did — it returned `invalid_token`. The token now stays on the row and `emailVerified` is what makes it inert. A double click is the ordinary case; mail clients and link scanners fetch the URL before the user does.
- **`events.linkAccount` fires only at link time, so it cannot fix accounts linked earlier.** Every existing account on both branches had `emailVerified: null` and would have been locked out with no way back. The backfill migration grandfathers everything that existed when verification shipped; everything after must verify. **A stamping event always needs a backfill companion.**
- **The `(auth)` group had to split.** Its layout bounced every signed-in visitor to `/dashboard`, which would have made `/verify-email` — the one page in that shell needing a session — an infinite redirect. Shell stays in `app/(auth)/layout.tsx`; the guard moved to `app/(auth)/(anonymous)/layout.tsx`. A session whose user row is gone is let through rather than redirected, or it bounces against `/verify-email`.
- **Resend's SDK resolves `{ data, error }` — it does not reject.** The spec's bare `await resend.emails.send(...)` reports success for a refused message.
- **`onboarding@resend.dev` only delivers to the API key owner** — confirmed live, and it rejects plus-aliases too. So registration returns 201 with `emailSent: false` rather than 500 when the send fails; the token is already stored and the re-send button recovers it. Otherwise a mail outage would strand a user retrying into a 409 on their own address.
- **`emailVerified` stays `DateTime?`.** The spec's `Boolean @default(false)` would break `@auth/prisma-adapter`, whose `AdapterUser` types it as `Date | null`.
- **`APP_URL`, not `NEXT_PUBLIC_APP_URL`.** The link is built inside the send helper and never reaches the browser.
- **The email is tables, inline styles and a flat PNG.** No client renders an SVG `<pattern>` or runs CSS animation, so the drift is dropped. `bgcolor` beside `background-image` is load-bearing — images are blocked by default, and without it the light text would land on white.

**Verified** against the Neon **development** branch and in the browser: registration stores a token with a 24h expiry; the link stamps `emailVerified` and returns `verified=true`; a second click returns `verified=already`; missing, unknown and expired tokens all return `error=invalid_token` and leave the account unverified. Signing in unverified lands on `/verify-email`, and `/dashboard` bounces there; the demo account signs straight through to a full dashboard. All three sign-in notices render, none when the params are absent. Two real messages were accepted by Resend. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (266 tests) and `next build` all green.

**Production was brought up to date in the same session:** both migrations applied via the direct endpoint, the two OAuth-only accounts purged on user instruction (one belonged to a second tester), and the demo account reseeded with full content. Prod now holds exactly one verified user with 1 apiary / 5 hives / 5 inspections.

**Left open:** **Vercel needs `RESEND_API_KEY` and `APP_URL`** — without the latter the verification link and the email's backdrop both point at `http://localhost:3000`, so the pattern never loads and the link is dead. **A domain must be verified at resend.com/domains before anyone but the key owner can register**, and the `from` address is a hardcoded constant, so switching it is a code change rather than an env var. **`events.linkAccount` has not been exercised against a live Google consent** — the backfill covers every current account, so nothing is broken, but the first new Google sign-in is its real test. No rate limiting on either re-send action: `/register/check-email`'s takes an address from the query string and is reachable signed out, which is the classic spam vector — it only mails unverified credentials accounts and answers identically either way, but nothing throttles it. Still no tests for `auth.schema.ts` or the register route, open since Phase 2. The prod demo password is `demo1234`, set deliberately via `DEMO_PASSWORD`; rotate before any real launch. `scripts/purge-users.ts` and `scripts/seed-demo.ts` are gitignored per user decision, but their `package.json` entries are committed and will point at missing files on any other checkout.

### Email Verification Toggle — completed 2026-08-29

One switch turns the whole verification requirement on or off, so the app can be demoed and tested before a sender domain exists. Merged to `main` as `9e67a4b` (feature commit `781c14e`).

**Delivered**

- `app/lib/email/config.ts` — `isEmailVerificationEnabled(env = process.env)`, the only reader of `EMAIL_VERIFICATION_ENABLED`. `config.test.ts`, 22 tests. Suite 266 → 288.
- `app/api/auth/register/route.ts` — stamps `emailVerified` and skips the send when off; returns `verificationRequired` alongside `emailSent`; a dev-only `console.info` on the skip.
- `app/components/auth/RegisterForm.tsx` — branches on that field, going to `/sign-in?registered=1` instead of `/register/check-email`.
- `app/(dashboard)/layout.tsx` — the gate is now `isEmailVerificationEnabled() && !user.emailVerified`.
- `app/(auth)/verify-email/page.tsx` → `/dashboard`, `app/(auth)/(anonymous)/register/check-email/page.tsx` → `/sign-in`, both re-send actions return early.
- `app/(auth)/(anonymous)/sign-in/page.tsx` — the `?registered=1` banner, restored.
- `.env.example` — the variable, its default, and the trade-off.

**No migration.** `emailVerified` is `DateTime?` already and every existing account is stamped.

**Decisions worth remembering**

- **Stamping `emailVerified` at creation is the whole feature.** Skipping only the *send* would leave a population of `emailVerified: null` rows that sign in fine while the flag is off and are all locked out the moment it goes on — the failure `20260829130000_backfill_email_verified` had to repair for accounts predating verification. Writing the stamp at creation means no backfill is ever needed. Verified live by flipping the flag: an account registered while off still reached `/dashboard` after it was switched on.
- **`/verify-email` needs `export const dynamic = 'force-dynamic'`.** With the flag off its redirect fires before any dynamic API is touched, so the page prerendered (`○` in the build output) and Next baked "redirect to `/dashboard`" into the build — switching the flag on would have had no effect until a rebuild. **Any page whose only env-dependent branch short-circuits before `auth()` or `searchParams` has this problem.**
- **`verificationRequired` in the 201 body, not a `NEXT_PUBLIC_` twin.** `RegisterForm` is `'use client'` and cannot read a server-only var. `emailSent: false` alone is ambiguous between "verification is off" and "the send failed", and those need opposite next screens. The client checks `=== false`, so a body that fails to parse falls through to the existing check-email path.
- **Default off when unset.** Enabled-by-default is the broken state while `onboarding@resend.dev` is the sender. The cost is recorded in `.env.example`: a forgotten variable in a deployment ships verification disabled rather than failing loudly.
- **`true` / `1` / `yes` / `on` all enable, case- and whitespace-insensitive.** Since unset means off, someone writing `=yes` and silently getting verification switched off is the expensive direction to guess wrong in. Quoted values (`"true"`) and trailing comments still read as off.
- **Both re-send actions check the flag themselves.** The pages' redirects hide the buttons but do not disable the endpoints — a server action is reachable by anyone holding its `$ACTION_ID`, including a tab left open across the flip.
- **`/api/auth/verify-email` is deliberately untouched**, so links already in the wild keep working after the flag goes off.
- **The `?registered=1` banner had to come back.** Phase 3 added it, the verification feature displaced it, and nothing rendered it any more — the flag-off flow lands there again.

**Verified** against the Neon **development** branch, flipping the flag between two production servers on port 3101. Flag off: register → 201 `verificationRequired: false`, row stamped with no token, `/dashboard` 200, `/verify-email` → `/dashboard`, `/register/check-email` → `/sign-in`, `?registered=1` banner rendering and no banner without params. Flag on: register → 201 `verificationRequired: true` with a token and 24h expiry, `emailVerified: null`, `/dashboard` → `/verify-email`, that page rendering the right address, `/register/check-email` 200. Across the flip: an account created while off reached `/dashboard` with the flag on; a token minted while on returned `verified=true`, then `verified=already`, then `error=invalid_token` for a bad token, after it was switched off. Three test accounts created and deleted. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (288 tests) and `next build` all green.

**Left open:** **Vercel needs `EMAIL_VERIFICATION_ENABLED`** — set it `false` (or leave it unset) until a domain is verified at resend.com/domains, since `FROM` in `send-verification-email.ts` is still `onboarding@resend.dev` and turning it on now would strand every new signup. Turning it on later is: verify the domain, change that constant (a code change, not an env var), set the variable, redeploy — Vercel bakes env vars into a deployment, so the value alone does nothing. **The re-send guards were verified by reading, not by request** — invoking a server action needs a page that renders its button, and with the flag off both such pages redirect. Everything the previous feature left open still stands: no rate limiting on either re-send action, no tests for `auth.schema.ts` or the register route (open since Phase 2), `events.linkAccount` still unexercised against a live Google consent, `/profile` still missing, and the prod demo password still `demo1234`.

### Forgot Password — completed 2026-08-30

`/forgot-password` and `/reset-password`, backed by the previously unused Auth.js `VerificationToken` table. Merged to `main` as `39ee04d` (feature commit `bfe3185`).

**Delivered**

- `app/lib/email/password-reset-token.ts` — generation, 1h expiry, the `password-reset:` identifier namespace and its reader, `buildPasswordResetUrl`. 21 tests.
- `app/lib/email/send-password-reset-email.ts` and `issue-password-reset.ts` — the write-then-send step, mirroring `issueVerificationEmail`.
- `app/api/auth/forgot-password/route.ts` and `app/api/auth/reset-password/route.ts`.
- `app/(auth)/(anonymous)/forgot-password/page.tsx` + `ForgotPasswordForm`; `app/(auth)/reset-password/page.tsx` + `ResetPasswordForm`.
- `app/lib/auth.schema.ts` — `forgotPasswordSchema`, `resetPasswordSchema`, `resetPasswordRequestSchema`, and a strengthened `newPassword`. `auth.schema.test.ts`, 43 tests — the gap open since Auth Phase 2.
- `PasswordField` in `fields.tsx` with a reveal toggle and a requirements checklist; `EyeIcon` / `EyeOffIcon`. Used on sign-in, register and both reset fields.
- `/sign-in` — the "Nie pamiętasz hasła?" link and the `reset=1` notice.
- `prisma/seed.ts` and `scripts/seed-demo.ts` — demo account moved to `demo@hivewise.app` / `Demo2026Miodowy`; `scripts/purge-users.ts` `KEEP_EMAILS` emptied. Suite 288 → 353.

**No migration.** The `VerificationToken` table has existed since `20260828141044_init` and had never been read or written — this feature is its first consumer, exactly as the load notes predicted.

**Decisions worth remembering**

- **The identifier is namespaced `password-reset:<email>`, and the prefix is checked on every read.** `@auth/prisma-adapter` writes a bare email as `identifier` for magic-link sign-in; that provider is not configured, but the prefix means enabling it later cannot make an adapter token spendable as a password reset. Verified live by planting a bare-identifier row: both the API and the page rejected it, **and left it in place** — a token belonging to another flow must not be destroyed by a failed reset attempt.
- **Reset tokens behave the opposite way to verification tokens, deliberately.** 1h rather than 24h, and deleted on consumption rather than left inert by `emailVerified`. A reset token has no natural inertness: leaving it live would let anyone who later reads the link (mail archive, forwarded thread, browser history) set the password again. Deletion is scoped to the identifier, so any other outstanding link for that address dies with it, and a fresh request drops the previous token first.
- **`deleteMany`, not `delete`, when consuming.** A double submit would make the second call throw `P2025` on a row the first already removed.
- **A reset may set a password on an OAuth-only account.** Registration refuses this because an unauthenticated request proves nothing; a reset link proves control of the mailbox, which is the same thing Google verified. Refusing would strand those users behind a generic message that cannot explain itself.
- **A successful reset stamps `emailVerified` when it is null.** Same proof, and without it a user could reset their password and still be parked on `/verify-email`.
- **`/forgot-password` answers `200 {ok:true}` for every address that parses** — known, unknown, OAuth-only and unverified alike. The opposite of the register route's 409, which has an excuse this endpoint does not. A send failure is swallowed and logged rather than returned, because a 500 would say "this address exists and our mailer is down".
- **`/reset-password` sits outside the `(anonymous)` group.** That layout redirects anyone with a live session, which would swallow the link for a user still signed in elsewhere and burn a token they cannot spend. `/forgot-password` stays inside it.
- **Both endpoints are route handlers, not server actions.** Beyond the status codes the forms branch on, Next traces server-action arguments in the dev console — a password submitted through an action is printed in plaintext, the bug `signInAction` still has.
- **`EMAIL_VERIFICATION_ENABLED` does not gate this flow.** Gating it would remove the only recovery path whenever the flag is off.
- **Sessions are JWTs, so a reset cannot revoke one.** An attacker already holding a valid cookie keeps it until expiry. Noted, not solved.
- **The password policy uses composition rules on user instruction, against NIST SP 800-63B**, which warns they produce `Password1!`. The weak-base blocklist is the part that earns its keep: `Password12345` satisfies every composition rule and is rejected. Letter classes are `\p{Lu}` / `\p{Ll}`, not `[A-Z]` — `Ą` has to count as a capital in a Polish app.
- **One `PASSWORD_REQUIREMENTS` list drives both the Zod checks and the on-screen checklist**, so they cannot drift into telling the user different things. `superRefine` reports every unmet rule at once rather than stopping at the first.
- **`PasswordField` tracks its own value in local state rather than the form's `watch()`.** `watch` trips `react-hooks/incompatible-library`, and local state keeps typing re-renders inside the field. The checklist appears only once the field is in error and clears itself when the password becomes valid.
- **The reveal button is `type='button'` with `tabIndex={-1}`.** A bare `<button>` inside a form submits it; the toggle exposes nothing a screen-reader user cannot already read, and sitting between the field and submit it would add a stop to every keyboard pass.
- **`tsc` type-checks `scripts/` even though it is gitignored** — which is what caught `Subscription.status` and `Apiary.location` being nullable in the SQL generator.

**Verified** against the Neon **development** branch and in the browser at 1440×900. API: malformed JSON, invalid address, unknown address (no token written), a known address with mixed case and whitespace normalised, a second request replacing the first token, superseded / unknown / empty / missing tokens, short and mismatched passwords, and each new password rule rejected with its own message. A successful reset changed the `$2b$10$` hash, left `emailVerified` intact, deleted only the reset token, and a replay returned 400 with the password unchanged. Expiry returned 400 and cleaned the row. An OAuth-only account (`passwordHash: null`) gained a password; an unverified account came back stamped. Browser: the full forgot → link → reset → `/sign-in?reset=1` → sign-in loop, the requirements checklist ticking live as the password is typed, both reset-form toggles independent, and a 44×44 touch target. Resend accepted a real message to the key owner's address. `tsc --noEmit`, `eslint`, `prettier --check`, `vitest run` (353 tests) and `next build` all green; both new routes are `ƒ`.

**Demo account rebuilt in the same session.** `demo@getapiary.app` / `demo1234` no longer satisfies the policy the app enforces, so it moved to `demo@hivewise.app` / `Demo2026Miodowy`. Dev was purged and reseeded through `db:purge-users` + `db:seed-demo`. **Production was applied by the user**, who ran a generated SQL script in the Neon console and confirmed the account: the sandbox blocked every path to a prod connection string, so `scripts/gen-demo-sql.ts` replays the seeded dev rows as literal SQL, wrapped in `BEGIN`/`COMMIT` and date-relative via `now() - interval` so the dashboard states do not drift. All four prod users were deleted, including a second tester's, on explicit confirmation.

**Left open:** **No rate limiting on `/forgot-password`** — the classic mail-spam vector, joining the two unthrottled re-send actions. **Resend still cannot mail anyone but the API key owner**: `FROM` is the hardcoded `onboarding@resend.dev`, so a reset link reaches nobody else until a domain is verified at resend.com/domains and that constant is changed. Vercel still needs `RESEND_API_KEY`, `APP_URL` and `EMAIL_VERIFICATION_ENABLED`; without `APP_URL` the reset link points at `localhost:3000`. Timing still separates a known address from an unknown one, since only the found branch mails. **The generated `scripts/seed-demo.sql` carries a bcrypt hash and is gitignored**, along with `gen-demo-sql.ts` — their `package.json` siblings still point at files absent from a fresh checkout. `/profile` still does not exist, and `events.linkAccount` is still unexercised against a live Google consent.
