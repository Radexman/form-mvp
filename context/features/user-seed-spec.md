# Seed Spec: Demo User with Apiary and 5 Hives

## Task

Write a Node.js seed script (`prisma/seed.ts`) that creates a realistic demo
user with one apiary, a premium subscription, five hives, and a seeded usage
period for the current month. The script must be idempotent — running it twice
must not create duplicates.

---

## Target schema

Use the Prisma client generated at `../generated/prisma` (Prisma 7, driver
adapter pattern). Import it from `@/lib/prisma` or instantiate directly — match
whatever pattern the project already uses in `app/lib/prisma.ts`.

---

## Data to create

### User

| Field          | Value                          |
|----------------|--------------------------------|
| `email`        | `demo@getapiary.app`           |
| `name`         | `Jan Pszczelarz`               |
| `passwordHash` | bcrypt hash of `demo1234`      |

Use `bcryptjs` (already in deps) with salt rounds `10`.

---

### Subscription

| Field   | Value     |
|---------|-----------|
| `tier`  | `PREMIUM` |
| `status`| `active`  |

Leave all Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`,
`currentPeriodEnd`) as `null` — this is a local demo account, not a real
Stripe customer.

---

### UsagePeriod

Create one record for the current calendar month:

| Field                | Value                                      |
|----------------------|--------------------------------------------|
| `periodStart`        | first day of current month, UTC midnight   |
| `pdfGenerationsUsed` | `3`                                        |
| `aiReportsUsed`      | `1`                                        |

---

### Apiary

| Field      | Value                       |
|------------|-----------------------------|
| `name`     | `Pasieka Turawa`            |
| `location` | `Turawa, woj. opolskie`     |

---

### Hives (5 total)

All hives belong to the apiary above. Use `HiveType.WIELKOPOLSKI` for all.
Leave `currentInspectionId` as `null` on every hive — no inspections are
seeded, that comes later.

| # | `label`    |
|---|------------|
| 1 | `Ul 1`     |
| 2 | `Ul 2`     |
| 3 | `Ul 3`     |
| 4 | `Ul 4`     |
| 5 | `Ul 5`     |

---

## Idempotency requirement

Before creating anything, check whether a user with `email = demo@getapiary.app`
already exists.

- If it **does not exist** → create everything from scratch using nested
  `create` calls in a single `prisma.$transaction([...])`.
- If it **already exists** → skip all inserts and log
  `[seed] Demo user already exists — skipping.` to stdout.

Do **not** use `upsert` for the user — a failed partial seed could leave the
user row without related records, so a full existence check + conditional
create is safer here.

---

## Creation order (respects FK constraints)

```
1. User
2. Subscription          (references User)
3. UsagePeriod           (references User)
4. Apiary                (references User)
5. Hive × 5             (references Apiary)
```

Wrap steps 1–5 in a single `prisma.$transaction` so a partial failure leaves
the database clean.

---

## Script structure

```ts
// prisma/seed.ts
import { PrismaClient, HiveType, PlanTier } from '../generated/prisma'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() { ... }

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

Add this to `package.json` so `prisma db seed` picks it up:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

---

## Console output expected

```
[seed] Hashing password...
[seed] Starting transaction...
[seed] Created user: demo@getapiary.app (id: ...)
[seed] Created subscription: PREMIUM
[seed] Created usage period: 2026-06-01
[seed] Created apiary: Pasieka Turawa
[seed] Created hives: Ul 1, Ul 2, Ul 3, Ul 4, Ul 5
[seed] Done.
```

---

## What NOT to do

- Do not seed any `Inspection`, `PdfGenerationJob`, or `AiReport` records —
  those come from a separate inspection seed spec.
- Do not hardcode the current month — derive `periodStart` dynamically:
  `new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))`.
- Do not use `prisma.user.upsert` — use the existence check pattern described
  above.
- Do not generate Stripe IDs — leave all Stripe fields null.
