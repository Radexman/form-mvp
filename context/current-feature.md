# Current Feature: Prisma 7 + Neon PostgreSQL Setup

## Status

In Progress

## Goals

- [x] Install and configure **Prisma 7.10** against a **Neon** serverless PostgreSQL database (no Prisma 6-era patterns).
- [x] Add `prisma.config.ts` (v7+ replaces `package.json#prisma` and automatic `.env` loading) with schema path, migrations path, and `datasource.url`.
- [x] Generate the client to an explicit output path (`generated/prisma`) — v7+ no longer writes into `node_modules/.prisma`.
- [x] Instantiate `PrismaClient` through a **driver adapter** (mandatory for SQL providers in v7+), with a dev-safe global singleton so Next.js hot reload doesn't open a new pool per request.
- [x] Author the initial `schema.prisma` from the data models in `@context/project-overview.md`: `User`, `Subscription`, `UsagePeriod`, `Apiary`, `Hive`, `Inspection`, `PdfGenerationJob`, `AiReport` + enums (`PlanTier`, `HiveType`, `HoneySufficiency`, `CombCondition`, `PdfJobStatus`).
- [x] Include NextAuth/Auth.js models: `Account`, `Session`, `VerificationToken`.
- [x] Add appropriate indexes and cascade deletes (`onDelete: Cascade` down the user → apiary → hive → inspection → pdf job chain; `@@index([hiveId, inspectedAt])`; unique constraints per the overview).
- [x] Establish the migration workflow: **always `prisma migrate dev` / `migrate deploy`, never `db push`** unless explicitly asked.
- [x] Wire `DATABASE_URL` into `.env.example` / `.env.local` and document the dev-branch vs production-branch split.

## Notes

### Scope

Schema + client wiring only. This is Phase 1 groundwork — it does **not** include auth flows, replacing the hardcoded hives, or changing the inspection submit path. Those follow now that the schema exists.

### Version correction: this is Prisma 7, not Prisma 8

The spec was originally written as "Prisma 8", but **every technical requirement in it describes Prisma 7**. Verified at implementation time (2026-08-28):

- `@prisma/client`, `@prisma/adapter-pg`, and `@prisma/adapter-neon` have **no 8.x release at all** — latest is 7.10.0. Only the `prisma` CLI package has an 8.0.0-rc.
- Prisma 8 is a **rewritten ORM**, not an increment: no `@prisma/client` (it's `@prisma/orm-postgres`), no `PrismaClient`/driver adapters, a contract (`contract.prisma` → JSON + `.d.ts`) instead of a generated client, and graph-based TypeScript migrations instead of `prisma migrate dev`.
- Prisma's own docs: *"Prisma 7 is still the right choice for your production apps."*
- Prisma 8 has **no Vercel deployment guide** yet (listed under "Coming as they land") and **no documented Neon story** — `@prisma/adapter-neon` is v7-only. This app deploys to Vercel against Neon.

Decision (user-approved): ship on **7.10.0 stable**, pinned exactly. Prisma publishes an incremental 7→8 upgrade guide that runs both versions side by side, so moving later is a migration, not a rewrite.

### Prisma 7 breaking changes (vs. pre-v7 muscle memory)

1. **ESM-first module format.**
2. **Explicit `output` path is required** in the `generator` block. Import from there, not `@prisma/client`. Note the generator emits **TypeScript sources** with extensionless imports — they need a bundler (Next.js, Vite) to resolve, so plain `node` cannot import the client directly.
3. **Driver adapters are mandatory** for SQL providers.
4. **Config moved to `prisma.config.ts`**; the `datasource` block in `schema.prisma` carries no `url`.
5. **Env loading is manual** — `prisma.config.ts` loads `.env.local` explicitly via `dotenv` so the CLI and Next.js read the same file.
6. **`Prisma.validator` is deprecated** — use the TypeScript `satisfies` operator for type-safe query fragments.

### Implementation decisions

- **Adapter: `@prisma/adapter-pg`, not `@prisma/adapter-neon`.** Direct TCP via node-postgres against Neon's *pooled* endpoint. Neon's pooler does the real pooling, so serverless functions hold only a small local pool (`max: 5`); this avoids the `ws`/`@neondatabase/serverless` dependency and works on Vercel's Node runtime. Switch to `adapter-neon` only if edge-runtime execution is needed later.
- **`connectionTimeoutMillis: 10_000` is set explicitly.** Driver adapters inherit node-postgres defaults, where the connection timeout is `0` (never) — unlike pre-v7 Prisma's 5s. Without this a half-open socket hangs a request forever, which is exactly the field-connectivity failure this phase exists to fix.
- **Client output is `generated/prisma` at the repo root, not `src/generated/prisma`.** This repo has no `src/` — the app lives at the root under `app/`. `generated/` is gitignored and rebuilt by the `postinstall` script, which is what makes it exist on Vercel.
- **Singleton lives at `app/lib/prisma.ts`** (the repo's actual lib location; the standards doc's `src/lib/` is stale).
- **`Hive.currentInspectionId` uses `onDelete: SetNull`,** not Cascade — deleting an inspection must never take the hive with it. This forms a two-table FK cycle with `Inspection.hive`, which PostgreSQL permits.
- **Auth.js field names stay snake_case** (`refresh_token`, `access_token`, …). `@auth/prisma-adapter` writes to those columns by name; renaming them to match the project's camelCase convention would break token persistence.
- **`vitest.config.mts` gained a `@` → project-root alias.** Vite does not read tsconfig `paths`, so any suite reaching `app/lib/prisma.ts` failed to resolve the generated client. Every future server-action test would have hit this.

### Migrations discipline (from spec)

Development work runs against the Neon **development** branch in `DATABASE_URL`; production is a separate branch. **Always create migrations, never push directly** unless explicitly told otherwise.

Scripts: `npm run db:migrate` (`prisma migrate dev`), `npm run db:deploy` (`prisma migrate deploy`), `npm run db:studio`. `postinstall` runs `prisma generate`.

### Environment variables

- `DATABASE_URL` — Neon **development** branch, *pooled* endpoint (host contains `-pooler`). Set in `.env.local`; the production branch URL belongs only in Vercel's project settings.
- `DIRECT_DATABASE_URL` — optional escape hatch. `prisma migrate` takes advisory locks that don't survive PgBouncer transaction pooling; `prisma.config.ts` prefers this when set. **Not currently needed** — `migrate dev` ran cleanly against the pooled endpoint.

### Verification performed

Initial migration `20260828141044_init` applied to the Neon **development** branch (`br-old-bonus-b1yjip8c`); all 11 tables + `_prisma_migrations` confirmed present via Neon MCP. The **production** branch is untouched and still empty.

A throwaway Vitest suite exercised the real singleton end to end and was then deleted: create `User → Apiary → Hive → Subscription`, create an `Inspection` with all seven JSON section columns plus derived scalars, set `Hive.currentInspectionId`, create a `PdfGenerationJob`, read the chain back, run the `@@index([hiveId, inspectedAt])` history query, then delete the user and confirm the cascade emptied every downstream table.

Checks green: `tsc --noEmit`, `eslint`, `vitest run` (189 tests), `next build`.

### TLS: `sslmode=verify-full`, not `require`

`pg-connection-string` warned that it currently treats `sslmode=require` as `verify-full`, and that pg v9 / pg-connection-string v3 will switch it to libpq semantics — which **skip certificate verification**. Left as `require`, a routine `pg` bump would have silently downgraded every database connection to unverified TLS.

Fixed rather than deferred: both `.env.local` and `.env.example` now spell out `sslmode=verify-full&channel_binding=require`, which pins the strong behavior across that future change. No extra CA config is needed — Neon's certificates chain to a public CA that Node's built-in trust store already carries.

Verified: a direct `pg.Client` connection reports `socket.authorized === true` with no `authorizationError`, against cert CN `*.c-5.eu-central-1.aws.neon.tech` (issuer `YR1`) — so the chain and hostname really are being checked. The warning is gone, the Prisma CLI still connects (`prisma migrate status` → "Database schema is up to date!"), and the app singleton still queries.

**Use `verify-full` in the Vercel production env var too**, not `require`.

### Stale doc note

`@context/coding-standards.md` has a trailing section describing a Sanity/monorepo layout (`frontend/`, `studio/`, TypeGen) that does not match this repo, and its File Organization section assumes a `src/` directory this repo doesn't have. Ignore both here; worth cleaning up separately.

## History
