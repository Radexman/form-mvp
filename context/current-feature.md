# Current Feature: Demo User Seed Script

## Status

In Progress — implemented and verified on `feat/demo-user-seed`, awaiting `/feature review`

## Goals

- `prisma/seed.ts` creates a complete demo account in one transaction: user `demo@getapiary.app` / `Jan Pszczelarz` with a bcrypt hash of `demo1234` (10 salt rounds).
- Related records follow FK order — `Subscription` (`PREMIUM`, `active`, all Stripe fields null), `UsagePeriod` for the current month (`pdfGenerationsUsed: 3`, `aiReportsUsed: 1`), `Apiary` (`Pasieka Turawa`, `Turawa, woj. opolskie`), and five `WIELKOPOLSKI` hives labelled `Ul 1`–`Ul 5` with `currentInspectionId` left null.
- Idempotent: an existence check on the email short-circuits with `[seed] Demo user already exists — skipping.` No `upsert` — a partial seed must not leave an orphaned user row.
- `periodStart` derived at runtime via `new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))`, never hardcoded.
- Progress logged to stdout in the order given by the spec, ending in `[seed] Done.`
- `prisma db seed` runs the script.
- No `Inspection`, `PdfGenerationJob`, or `AiReport` records — those belong to a later spec.

## Notes

Spec: [context/features/user-seed-spec.md](context/features/user-seed-spec.md)

**Gaps between the spec and the repo, to settle during `start`:**

- **`bcryptjs` is not installed.** The spec says it is "already in deps"; [package.json](package.json) has no `bcryptjs` and no `@types/bcryptjs`. Both need adding as devDependencies (seed-only).
- **`tsx` is not installed either**, and the spec's seed command (`tsx prisma/seed.ts`) depends on it.
- **Seed config location is Prisma 7, not the `package.json` `"prisma"` key.** The spec's `package.json` snippet is the pre-v7 pattern; v7 moves it into `migrations.seed` in [prisma.config.ts](prisma.config.ts), which this repo already has.
- **Import path differs.** The spec writes `from '../generated/prisma'`; the generated client actually lives at `@/generated/prisma/client` ([app/lib/prisma.ts:3](app/lib/prisma.ts#L3)). The seed runs outside Next.js, so it also needs its own `PrismaClient` built on the `PrismaPg` adapter with `DATABASE_URL` — the app singleton is not directly reusable from a CLI script.
- **`$transaction([...])` array form can't emit the spec's step-by-step logs**, since every promise is dispatched before any resolves. Use the interactive form, `$transaction(async (tx) => …)`, to keep both the ordering and the log lines.
- Schema constraints already agree with the spec: `Apiary.userId` and `Subscription.userId` are `@unique` (one apiary and one subscription per user), and `UsagePeriod` is `@@unique([userId, periodStart])`.
- Target is the Neon **development** branch, matching the Prisma setup phase.

**How each gap was resolved during `start`:**

- Installed `bcryptjs@3.0.3` and `tsx@4.23.12` as devDependencies. **No `@types/bcryptjs`** — v3 ships its own declarations, and the DefinitelyTyped package is stale v2 defs that would shadow them.
- Seed command lives in `migrations.seed` in [prisma.config.ts](prisma.config.ts), not the `package.json` `"prisma"` key. Added `db:seed` npm script.
- Seed imports `./generated/prisma/client` relatively rather than through the `@` alias, and builds its own `PrismaClient` on `PrismaPg` with `max: 1` — the schema declares no datasource `url`, so an adapter is mandatory even outside Next.js.
- Used the interactive `$transaction(async (tx) => …)` with `{ maxWait: 10_000, timeout: 20_000 }`; the 2s/5s defaults are too tight for a cold Neon compute.
- Replaced the spec's `process.exit(1)` in `.catch` with `process.exitCode = 1` — `process.exit` terminates before `.finally` can run `$disconnect()`.
- Hives created with one `createMany` rather than five `create` calls.

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
