# Beekeeping Inspection App — Project Specification

**Product:** Mobile-first hive inspection tool for beekeepers, backed by a growing web app with dashboards, history, and eventually AI-assisted apiary analytics
**Status:** Form MVP is live (hardcoded 5 test hives, client-side PDF via a connected microservice, no persistence). This spec covers the transition from "form that produces a PDF" to a real, accounted-for app: database, auth, per-user apiaries, hive history, and a SaaS pricing model.

---

## Problem (Core Idea)

The current MVP is a multi-step inspection form. Filling it out generates a PDF via a separate Python microservice hosted on Render, and that PDF is the *only* artifact — it lands on the user's device and nothing is kept anywhere else. Three problems fall out of that:

1. **Nothing persists.** There is no record of a hive's history, no way to see how it's trending, no way to pre-fill next month's form from last month's answers.
2. **PDF generation happens synchronously, in the field.** Beekeepers are often at the apiary on weak mobile signal. If the request to Render fails or times out mid-inspection, the work is lost or the beekeeper has to redo the call later with no source data to redo it *from*.
3. **There's no user at all.** Five hives are hardcoded for development convenience; there's no login, no ownership, no reason yet to come back to the app between inspections.

This phase fixes all three: a Postgres database via Prisma, real authentication, and apiaries/hives that belong to a user. Filling out the inspection form becomes the reliable, offline-friendly part of the flow — the data is saved the moment the form is submitted, regardless of network quality. PDF generation becomes something that can be *retried later* from saved data instead of something that has to succeed on the first try in a field with no signal.

Once that foundation exists, the product grows into a subscription app: a free tier and a premium tier, gated PDF generation and AI-analysis quotas, and Stripe billing.

---

## Users

The target beekeeper is deliberately **in the middle** of the hobbyist/professional spectrum:

- **Not the backyard hobbyist with 2–3 hives** who visits occasionally and wouldn't get value from structured record-keeping — the overhead of a full inspection form isn't worth it for them.
- **Not the professional with hundreds of colonies** — that beekeeper doesn't work this way at all. They know their operation from memory and mark individual hives with the task that's needed (requeen, add super, treat) rather than filling out a structured report per visit.
- **The target user** manages something like 5–40 hives seriously enough to want a real history per hive, to want to catch a hunger period or a health issue before it's a crisis, and to want pre-filled forms so a routine inspection takes two minutes of typing instead of ten. This is a semi-serious hobbyist or small-scale sideliner who treats the apiary as more than a garden ornament but doesn't yet — or doesn't want to — run it purely from memory.

Secondary persona: **future-me maintaining this app**, since it needs to grow from "form + PDF" into a real multi-tenant SaaS without a rewrite.

---

## Tech Stack

| Layer                 | Technology                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| Framework              | Next.js (App Router) + TypeScript                                      |
| Data fetching/mutation | Server Actions (no separate REST/API layer for internal app data)      |
| Database               | PostgreSQL                                                              |
| ORM                     | Prisma                                                                  |
| DB                      | Neon                                                                     |
| Auth                    | Custom or Auth.js-based login/logout/register (email + password to start); session-based, server-action-driven |
| Forms                   | react-hook-form + zod (already established in the MVP form)            |
| PDF generation          | External Python microservice, hosted on Render, called from a server action; treated as an unreliable dependency that can be retried |
| Billing                 | Stripe (subscriptions: free / premium)                                 |
| AI                      | OpenAI SDK, used for apiary-level analytics reports (premium feature)  |
| Styling                 | Tailwind CSS                                                            |
| Charts / analytics UI   | Chart library TBD at implementation time (e.g. Recharts) — desktop dashboard only |
| Deployment              | Vercel (Next.js app) + Render (PDF microservice, unchanged)             |

**Deliberately deferred:** multi-apiary-per-user (schema should not block it, but the UI and quotas assume one apiary per user for now), real-time features, mobile app wrapper — this stays a responsive web app.

---

## Product Shape: MVP → Full App

| Aspect              | Now (MVP)                          | This phase                                                   |
| ------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Hives                | 5 hardcoded, for dev convenience   | User-owned, created through the app, arbitrary count           |
| Persistence          | None — PDF is the only output      | Every submitted inspection is saved to Postgres before PDF generation is even attempted |
| Auth                 | None                                | Register / login / logout, session-based                       |
| PDF generation       | Synchronous call to Render, blocking, no retry | Same call, but decoupled: it can be retried later from saved inspection data if it fails or if the user is offline in the field |
| Pricing              | N/A                                 | Free vs Premium tiers, Stripe-backed, with monthly quotas on PDF generation and AI reports |
| Hive state           | N/A (no persistence)                | Each hive's "current state" is derived from its most recent inspection |
| Form pre-fill        | Blank every time                   | Pre-filled from the hive's previous inspection where sensible (frame layout, hive type, etc.) |
| Analytics            | None                                | Honey-weight-over-time charts, hunger/nectar-flow signals, AI-generated apiary summaries (premium) |

---

## Data Model (Prisma)

This is the target shape of the schema. Migrations can be applied incrementally, but new work should be written against these models rather than ad hoc fields.

```prisma
// ── Identity & billing ────────────────────────────────────────────────

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  passwordHash   String
  name           String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  apiary         Apiary?               // one-to-one for now; model allows widening to one-to-many later
  subscription   Subscription?
  usagePeriods   UsagePeriod[]
  aiReports      AiReport[]
}

model Subscription {
  id                    String   @id @default(cuid())
  userId                String   @unique
  user                  User     @relation(fields: [userId], references: [id])
  tier                  PlanTier @default(FREE)
  stripeCustomerId      String?  @unique
  stripeSubscriptionId  String?  @unique
  status                String?  // mirrors Stripe subscription status: active, past_due, canceled, ...
  currentPeriodEnd      DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

enum PlanTier {
  FREE
  PREMIUM
}

// Tracks monthly consumption against the plan's quotas. One row per user per
// calendar month, created lazily on first use. Keeping this as its own model
// (rather than counters on User) means quota logic never has to special-case
// "start of month" resets — a new period is just a new row.
model UsagePeriod {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  periodStart       DateTime // first of the month, UTC
  pdfGenerationsUsed Int     @default(0)
  aiReportsUsed      Int     @default(0)

  @@unique([userId, periodStart])
}

// Plan limits live in code/config, not the DB, since pricing is still being
// worked out. Only the *usage counters* above need to be durable.
// Working numbers to build against (subject to change before launch):
//   FREE:    15 PDF generations / month,  5 AI reports / month
//   PREMIUM: 50 PDF generations / month, 25 AI reports / month

// ── Apiary & hives ─────────────────────────────────────────────────────

model Apiary {
  id        String    @id @default(cuid())
  userId    String    @unique   // enforces one apiary per user today; drop @unique to allow many later
  user      User      @relation(fields: [userId], references: [id])
  name      String
  location  String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  hives     Hive[]
  aiReports AiReport[]
}

model Hive {
  id                  String       @id @default(cuid())
  apiaryId            String
  apiary              Apiary       @relation(fields: [apiaryId], references: [id])
  label                String       // user-facing name, e.g. "Hive 3" / "Grandma's hive"
  hiveType             HiveType
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  // Denormalized pointer to the most recent completed inspection. This is
  // what "current hive state" and form pre-fill read from, so it doesn't
  // have to be recomputed with an ORDER BY + LIMIT 1 on every page load.
  currentInspectionId  String?      @unique
  currentInspection    Inspection?  @relation("CurrentState", fields: [currentInspectionId], references: [id])

  inspections          Inspection[] @relation("HiveInspections")
}

enum HiveType {
  WIELKOPOLSKI
  DADANT
  LANGSTROTH
  WARRE
  LAYENS
  OTHER
}

// ── Inspections ─────────────────────────────────────────────────────────

// One row per submitted inspection. The form's five sections (queen, colony,
// comb, brood, health, actions, notes) each map to a JSON column here rather
// than being split into their own tables — they're already validated,
// versioned zod shapes on the client, and the PDF microservice consumes them
// as structured JSON. A handful of fields the analytics dashboard needs to
// query/aggregate directly (honey weight, comb condition, brood pattern) are
// pulled out as their own scalar columns so charts don't require unpacking
// JSON in application code.
model Inspection {
  id             String    @id @default(cuid())
  hiveId         String
  hive           Hive      @relation("HiveInspections", fields: [hiveId], references: [id])
  userId         String    // denormalized for quota/ownership checks without a join
  inspectedAt    DateTime  @default(now())
  createdAt      DateTime  @default(now())

  // Raw, form-shaped sections — source of truth, used to regenerate the PDF
  // and to pre-fill the next inspection's form.
  queen          Json
  colony         Json
  comb           Json      // includes frames[], frame_type, slots, low_confidence
  brood          Json
  health         Json
  actions        Json
  notes          String    @default("")

  // Derived, queryable summary fields (computed server-side, mirroring what
  // the PDF microservice already derives from comb data).
  combSchemaVersion Int    @default(2)
  honeyKg           Float?
  honeySufficiency  HoneySufficiency?
  combCondition     CombCondition?

  pdfJobs        PdfGenerationJob[]
  currentForHive Hive?     @relation("CurrentState")

  @@index([hiveId, inspectedAt])
}

enum HoneySufficiency {
  SUFFICIENT
  MODERATE
  LOW
  NONE
}

enum CombCondition {
  GOOD
  OLD
  NEEDS_REPLACEMENT
}

// ── PDF generation (decoupled, retryable) ────────────────────────────────

// A PDF is requested against already-saved inspection data, so a failed or
// timed-out call to the Render microservice never loses the inspection —
// only the PDF. The user (or a background job) can retry by re-triggering
// generation from this row's inspectionId.
model PdfGenerationJob {
  id            String    @id @default(cuid())
  inspectionId  String
  inspection    Inspection @relation(fields: [inspectionId], references: [id])
  status        PdfJobStatus @default(PENDING)
  requestedAt   DateTime  @default(now())
  completedAt   DateTime?
  fileUrl       String?
  errorMessage  String?
  attempts      Int       @default(0)
}

enum PdfJobStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
}

// ── AI analytics (premium) ────────────────────────────────────────────

model AiReport {
  id         String   @id @default(cuid())
  apiaryId   String
  apiary     Apiary   @relation(fields: [apiaryId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  createdAt  DateTime @default(now())
  content    String   // model output, stored as markdown/text
  model      String   // e.g. "gpt-4.1" — kept for cost/debugging visibility
}
```

Notes on the modeling choices:

- **One apiary per user, enforced by `@unique` on `Apiary.userId`.** The relation is still modeled as its own table (not fields flattened onto `User`) specifically so removing that `@unique` later — to support multiple apiaries per user — is a migration, not a redesign.
- **Inspection sections stay as JSON.** They're already validated zod shapes with their own evolution story (see `COMB_SCHEMA_VERSION` in the comb schema) — normalizing every field into relational columns would fight the form's natural shape for no query benefit, since the dashboard only needs a handful of derived scalars, not the raw per-frame breakdown.
- **`Hive.currentInspectionId` is denormalized on purpose.** "Current state of the hive" and "data to pre-fill the next form" are read on nearly every page that touches a hive; a self-referencing pointer avoids an `ORDER BY inspectedAt DESC LIMIT 1` on every one of those reads.
- **`PdfGenerationJob` is separate from `Inspection`.** Submitting the form and generating the PDF are two different reliability domains — the first must never fail because of the second. This table is also what backs a "regenerate PDF" action in the UI for inspections whose original PDF call failed.

---

## Inspection Form (existing, unchanged)

The multi-step form already covers the following sections, each with its own zod schema (`*.schema.ts`) and defaults:

| Step     | Captures                                                                 |
| -------- | -------------------------------------------------------------------------- |
| Queen    | status (seen / not seen, brood OK / missing), marking + color, queen cells + count |
| Colony   | frames covered, behavior, hive space; honey stores/kg are **derived**, not entered |
| Comb     | frame type, slot count, per-frame brood/honey/pollen fill (in tenths), per-frame condition; honey weight, comb condition, and sufficiency are all derived server-side from this |
| Brood    | brood types present, brood pattern (1–5)                                   |
| Health   | conditions observed, varroa drop count (required iff varroa is selected), free-text "other" (required iff "other" is selected) |
| Actions  | multi-select of ~35 categorized actions (feeding, comb work, supers, honey, queen/propagation, treatment, hive maintenance, winterization), free-text "other" |
| Notes    | free-text, up to 2000 characters                                           |

This phase does not change these schemas. What changes is what happens after submission: instead of going straight to the PDF microservice, the validated payload is persisted as an `Inspection` row first, the hive's `currentInspectionId` is updated, and PDF generation is kicked off as a retryable job against that saved row.

---

## Auth & Server Actions

- Register / login / logout as server actions, session-based (httpOnly cookie).
- Every server action that touches `Hive`, `Inspection`, or `Apiary` data authorizes against the session's `userId` — there is no cross-user data access, and the one-apiary-per-user constraint means most authorization checks reduce to "does this hive belong to this user's apiary."
- No public API surface yet; server actions are the only way the client talks to the app. The PDF microservice remains the one external HTTP dependency, called server-side (never directly from the client) so retries, quota checks, and auth stay centralized.

---

## Subscription & Quotas (Stripe)

- Two tiers: **Free** and **Premium**, tracked on `Subscription.tier`, driven by Stripe subscription status via webhook.
- Gated by tier:
  - **PDF generation** — printable PDF export of an inspection. Working numbers: 15/month free, 50/month premium. (Filling out the form and saving an inspection is never gated — only turning it into a PDF is.)
  - **AI apiary analysis** — working numbers: 5/month free, 25/month premium.
- Quota enforcement reads/writes `UsagePeriod` for the current calendar month; limits themselves live in application config so pricing can be iterated without a migration.
- Stripe webhook handler updates `Subscription.status` / `tier` / `currentPeriodEnd` on `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Exact pricing and final quota numbers are explicitly **not** locked in yet — the schema and quota-checking code should treat the limits as configuration, not as something baked into logic.

---

## Analytics & AI Features

- **Honey weight over time** — per-hive line chart from `Inspection.honeyKg` across `inspectedAt`, used to flag a likely hunger period (sharp drop with no corresponding harvest action) or nectar flow (sustained rise).
- **Apiary-level AI report (premium)** — OpenAI SDK call summarizing recent inspections across all hives in the apiary: flags hives trending toward low stores, repeated health conditions, queen issues, and anything worth prioritizing on the next visit. Stored as an `AiReport` row so past reports remain readable without re-calling the model.
- Charts and the AI-report view are desktop-dashboard features (see Design below) — not part of the mobile in-field flow.

---

## Design

- **Visual style:** greenish, "power tool" aesthetic — utilitarian, high-contrast, built for a work context rather than a lifestyle app.
- **Mobile (in-field use):** large tap targets, minimal typing, form-first. This is the surface used standing at a hive, often with gloves on and patchy signal — every design decision on mobile optimizes for speed and reliability of data entry, not information density.
- **Desktop (planning/review use):** dashboards, charts, inspection history, AI reports. This is the surface used at a desk reviewing the season, not in the field.
- No dark/light mode requirement specified yet — treat as open until specified.

---

## Environment Variables

```
DATABASE_URL=
NEXTAUTH_SECRET=            # or equivalent session secret if not using Auth.js
PDF_SERVICE_URL=            # Render-hosted Python microservice
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PREMIUM=
NEXT_PUBLIC_APP_URL=
```

---

## Development Phases

### Phase 1 — Foundation (current priority)

Postgres + Prisma setup · `User`, `Apiary`, `Hive`, `Inspection` models · register/login/logout · replace hardcoded hives with user-owned hives · inspection submission writes to DB before calling the PDF service · `Hive.currentInspectionId` kept in sync on each new inspection

### Phase 2 — Reliable PDF generation

`PdfGenerationJob` model · decouple PDF request from form submission · retry/regenerate action in the UI for failed or skipped PDF jobs · surface job status ("PDF pending — will retry" vs "PDF ready")

### Phase 3 — History & pre-fill

Inspection history view per hive · pre-fill new inspection forms from the hive's `currentInspection` (frame layout, hive type, last-known comb state) · basic dashboard: list of hives with current state at a glance

### Phase 4 — Billing

Stripe integration · `Subscription` + `UsagePeriod` models · quota enforcement on PDF generation · pricing page · webhook handling

### Phase 5 — Analytics & AI

Honey-weight-over-time charts · hunger/nectar-flow flagging · OpenAI-backed apiary report generation · quota enforcement on AI reports · `AiReport` history view

### Phase 6 — Polish

Mobile form performance pass (offline resilience, slow-network handling) · desktop dashboard design pass · onboarding for first-time apiary/hive setup

---

## Notes

- The inspection form's zod schemas are the contract with the PDF microservice and should not be duplicated or reshaped on the way into Postgres — store them close to as-is (JSON columns) and derive only what the dashboard actually needs to query.
- "Save first, generate PDF later" is the single most important behavior change in this phase — it's the fix for the actual field problem (flaky connectivity), and the DB/auth work exists largely in service of making that possible.
- Multi-apiary-per-user is intentionally out of scope for the UI right now, but the schema should not have to be redesigned to support it later — see the `Apiary.userId @unique` note above.
- Final pricing and quota numbers are not decided — build the quota-checking code against config values, not hardcoded numbers, so this can change without a migration.
