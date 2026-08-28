# Dashboard Spec 2 — Real Data from Database

## Scope

Replace all hardcoded mock data in the dashboard with real data fetched
from the seeded Postgres database via Prisma. Add auth guard so
unauthenticated users are redirected to `/login`. No UI changes — the
layout from Spec 1 remains pixel-identical. Only the data layer changes.

---

## Prerequisites

- Spec 1 dashboard layout is complete and renders without errors
- Prisma seed has been run (`npx prisma db seed`) — demo user exists:
  `demo@hivewise.app` with 1 apiary (`Pasieka Turawa`) and 5 hives
- Auth session is available via the project's session helper
  (e.g. `auth()` from Auth.js or equivalent `getSession()`)
- Prisma client is available at `@/lib/prisma`

---

## Auth guard

The `(dashboard)/layout.tsx` must protect all dashboard routes.
Add the guard at the top of the layout, before rendering children:

```ts
// app/(dashboard)/layout.tsx
import { auth } from '@/lib/auth'   // adjust import to match project auth setup
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <DashboardShell>{children}</DashboardShell>
}
```

The session object must carry at least `user.id` and `user.name` for
the sidebar footer and personalized greeting.

---

## Data fetching

### Where to fetch

`app/(dashboard)/dashboard/page.tsx` is a React Server Component.
Fetch all data here, derive computed fields in the same file, and pass
the results down as props to presentational components.

Do **not** fetch inside `Sidebar`, `HiveCard`, or `AlertCard` — those
stay as pure presentational components that receive props.

### What to fetch

One Prisma query fetches everything the dashboard needs:

```ts
// app/(dashboard)/dashboard/page.tsx
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const apiary = await prisma.apiary.findUnique({
    where: { userId: session.user.id },
    include: {
      hives: {
        orderBy: { createdAt: 'asc' },
        include: {
          currentInspection: true,   // Inspection | null
        },
      },
    },
  })

  if (!apiary) redirect('/onboarding')   // user has no apiary yet

  // derive, compute, pass to components (see below)
}
```

`currentInspection` is `Inspection | null` — a hive that has never been
inspected will have `null` here. All derived logic must handle this case.

---

## Derived fields

Compute these in the page component, not in child components.

### Hive status

Status is not stored in the database — derive it from `currentInspection`:

```ts
type HiveStatus = 'ok' | 'warning' | 'danger' | 'never_inspected'

function deriveHiveStatus(hive: HiveWithInspection): HiveStatus {
  const insp = hive.currentInspection
  if (!insp) return 'never_inspected'

  const queen = insp.queen as QueenData   // cast JSON column to typed shape

  // danger: queen missing
  if (queen.queen_status === 'missing') return 'danger'

  // danger: swarm queen cells
  if (queen.queen_cells === 'swarm') return 'danger'

  // warning: queen not seen (but brood ok)
  if (queen.queen_status === 'not_seen_brood_ok') return 'warning'

  // warning: emergency queen cells
  if (queen.queen_cells === 'emergency') return 'warning'

  // warning: inspection overdue (more than 14 days ago)
  const daysSince = Math.floor(
    (Date.now() - new Date(insp.inspectedAt).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSince > 14) return 'warning'

  return 'ok'
}
```

### Inspection overdue

```ts
function daysSinceInspection(inspectedAt: Date): number {
  return Math.floor(
    (Date.now() - new Date(inspectedAt).getTime()) / (1000 * 60 * 60 * 24)
  )
}
```

### Alerts

Alerts are hives with status `warning` or `danger`:

```ts
const alertHives = apiary.hives
  .map(hive => ({ hive, status: deriveHiveStatus(hive) }))
  .filter(({ status }) => status === 'warning' || status === 'danger')
```

### Alert description

```ts
function deriveAlertDescription(hive: HiveWithInspection, status: HiveStatus): string {
  const insp = hive.currentInspection
  if (!insp) return 'Brak przeglądów'

  const queen = insp.queen as QueenData
  const daysSince = daysSinceInspection(insp.inspectedAt)

  if (queen.queen_status === 'missing') return 'Brak matki · sprawdź mateczniki'
  if (queen.queen_cells === 'swarm')    return 'Mateczniki rojowe · interweniuj'
  if (queen.queen_cells === 'emergency') return 'Mateczniki ratunkowe'
  if (queen.queen_status === 'not_seen_brood_ok') return 'Matka niewidziana, czerw OK'
  if (daysSince > 14) return `Przegląd przeterminowany · ${daysSince} dni`

  return 'Wymaga obserwacji'
}
```

### Colony strength

`Inspection.colony` is a JSON column. Cast it and read `frames_covered`:

```ts
function deriveStrength(inspection: Inspection | null): number {
  if (!inspection) return 0
  const colony = inspection.colony as ColonyData
  return colony.frames_covered ?? 0   // 0–10, render as 0–5 dots by halving or direct
}
```

Dots display: clamp the value to 1–5 for the `StrengthDots` component.
If `frames_covered` is on a 0–10 scale, map to dots with
`Math.round(frames_covered / 2)`.

### Last inspection date label

```ts
function formatInspectionDate(inspectedAt: Date | null): string {
  if (!inspectedAt) return 'Brak przeglądu'
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(inspectedAt))
}
```

### Page-level stats (for page header meta line)

```ts
const totalHives = apiary.hives.length
const alertCount = alertHives.length

const lastInspectionDate = apiary.hives
  .map(h => h.currentInspection?.inspectedAt)
  .filter(Boolean)
  .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null
```

---

## TypeScript types for JSON columns

Define these types next to the page component or in `types/inspection.ts`:

```ts
// types/inspection.ts

export interface QueenData {
  queen_status: 'seen' | 'not_seen_brood_ok' | 'missing'
  queen_marked: boolean
  queen_marker_color: string
  queen_cells: 'none' | 'emergency' | 'swarm' | 'supersedure'
  queen_cells_count: number
}

export interface ColonyData {
  frames_covered: number   // 0–10
  behavior: 'calm' | 'nervous' | 'aggressive' | 'swarm_mood'
  honey_stores: 'sufficient' | 'low' | 'none'
  honey_kg: number
  hive_space: 'ok' | 'tight' | 'loose' | 'added_super'
}

// Extend as needed when Comb, Brood, Health specs are implemented
export type HiveWithInspection = Prisma.HiveGetPayload<{
  include: { currentInspection: true }
}>
```

---

## Passing data to components

Assemble the final props in the page and pass down:

```ts
// in DashboardPage, after deriving everything:

const hivesWithMeta = apiary.hives.map(hive => ({
  id:              hive.id,
  number:          hive.label,            // e.g. "Ul 1"
  queenStatus:     (hive.currentInspection?.queen as QueenData | undefined)
                     ?.queen_status ?? null,
  strength:        deriveStrength(hive.currentInspection),
  lastInspection:  formatInspectionDate(hive.currentInspection?.inspectedAt ?? null),
  status:          deriveHiveStatus(hive),
}))

const alertsWithMeta = alertHives.map(({ hive, status }) => ({
  id:          hive.id,
  hiveLabel:   hive.label,
  variant:     status === 'danger' ? 'danger' : 'warning',
  description: deriveAlertDescription(hive, status),
  strength:    deriveStrength(hive.currentInspection),
  date:        formatInspectionDate(hive.currentInspection?.inspectedAt ?? null),
}))

return (
  <DashboardView
    userName={session.user.name ?? 'Pszczelarzu'}
    apiaryName={apiary.name}
    apiaryLocation={apiary.location ?? ''}
    totalHives={totalHives}
    alertCount={alertCount}
    lastInspectionDate={formatInspectionDate(lastInspectionDate)}
    hives={hivesWithMeta}
    alerts={alertsWithMeta}
  />
)
```

`DashboardView` is a thin client component wrapper that takes all the
derived data as props and renders `AlertCard`, `HiveCard`, etc.
It exists to keep the server component clean and the presentational
layer testable.

---

## Sidebar: real user name

Update `Sidebar` to accept `userName` and `userPlan` as props (passed
from layout, which reads the session):

```ts
// app/(dashboard)/layout.tsx
const session = await auth()
const subscription = await prisma.subscription.findUnique({
  where: { userId: session.user.id },
  select: { tier: true },
})
const plan = subscription?.tier ?? 'FREE'

// pass to DashboardShell → Sidebar
```

Display:
- Name: first name only — `session.user.name?.split(' ')[0]`
- Plan: `plan === 'PREMIUM' ? 'Premium' : 'Free'`
- Plan color: `color: var(--accent)` for Premium, `color: var(--muted)` for Free

---

## Greeting

Personalize the page header with time-of-day greeting:

```ts
function getGreeting(name: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Dzień dobry, ${name}`
  if (hour < 18) return `Dzień dobry, ${name}`
  return `Dobry wieczór, ${name}`
}
```

---

## Never-inspected hives

Hives with `currentInspection === null` (freshly seeded, no inspections):

- `queenStatus`: render as `null` → display `'Brak przeglądów'` in muted color
- `strength`: 0 → StrengthDots renders all empty
- `lastInspection`: `'Brak przeglądu'`
- `status`: `'never_inspected'` → treat as `'ok'` for border color (no alarm,
  just neutral), but show different queen label color (`var(--muted)`)

Since the seed creates 5 hives with no inspections, the entire dashboard
will render in this "never inspected" state initially. That is the correct
and expected behavior — it confirms the data layer is working.

---

## Error states

Handle these cases without crashing:

| Condition | Behavior |
|-----------|----------|
| `apiary === null` | `redirect('/onboarding')` |
| `hive.currentInspection === null` | show "Brak przeglądu", empty dots, neutral card |
| Prisma query throws | let Next.js error boundary handle it (no try/catch needed at this stage) |
| `session.user.id` missing | `redirect('/login')` |

---

## Acceptance criteria

- [ ] Unauthenticated request to `/dashboard` redirects to `/login`
- [ ] Authenticated request as `demo@hivewise.app` renders the dashboard
- [ ] Sidebar footer shows "Jan P." (first name + initial) and "Premium"
- [ ] Page greeting shows real first name from session
- [ ] Apiary name in topbar matches seed: "Pasieka Turawa"
- [ ] Hive grid shows exactly 5 cards (seed has 5 hives)
- [ ] All 5 hive cards show "Brak przeglądu" / empty dots (no inspections seeded yet)
- [ ] No alert cards shown (no inspections = no derived status = no alerts)
- [ ] Page meta line shows "5 uli · brak przeglądów · 0 wymaga uwagi"
- [ ] No TypeScript errors, no Prisma type errors
- [ ] No `any` casts except on JSON columns (which must use the typed interfaces)
- [ ] Query runs in a single `findUnique` with `include` — no N+1 queries

---

## What this spec does NOT cover

- Onboarding flow for users without an apiary
- Creating / deleting hives from the UI
- Click handlers on "Przegląd" and "Szczegóły" buttons
- Inspection submission (separate spec)
- Stripe quota checks
- Mobile layout

---

## Addendum — repo reconciliation (added by `/feature load`, 2026-08-28)

Checked against the working tree at commit `3d1c421`, before any auth work. Deferred:
auth is being built first, then this spec gets reloaded. Re-verify the "no auth"
section below once Auth Phase 1 has landed — most of it should be obsolete by then.

### Blocked on auth (the reason this spec was deferred)

- No `next-auth`, no `@auth/prisma-adapter`, no auth package of any kind in
  `package.json` — only `@ark-ui/react`, `@hookform/resolvers`,
  `@prisma/adapter-pg`, `@prisma/client`, `dotenv`, `next`, `react`, `react-dom`,
  `react-hook-form`, `zod`.
- No `app/lib/auth.ts`. `app/lib/` holds `beehives.ts`, `inspection-context.ts`,
  `prisma.ts`, `voice/`.
- No `/login` and no `/onboarding` route. The only pages are `app/page.tsx` and
  `app/(dashboard)/dashboard/page.tsx`, so both of this spec's redirects target 404s.
  `/onboarding` is out of scope here (see "What this spec does NOT cover") but the
  redirect still has to land somewhere real.
- The schema *does* carry Auth.js `Account` / `Session` / `VerificationToken`
  models from the Prisma phase, but nothing reads them.

### Corrections to this spec's stated facts

- **Demo email is `demo@getapiary.app`**, not `demo@hivewise.app` (`prisma/seed.ts:11`).
  The acceptance criteria name an address that does not exist. `Hivewise` is the
  wordmark; `getapiary.app` is the seed domain.
- **Prisma client is at `@/app/lib/prisma`**, not `@/lib/prisma`. `tsconfig.json`
  maps `@/*` → `./*`; there is no root `lib/` and no `src/`. Same correction for
  `@/lib/auth` once it exists.
- **`prisma.apiary.findUnique({ where: { userId } })` is valid** — `Apiary.userId`
  is `@unique`, which is what makes this spec's single-apiary shape hold.

### "No UI changes" is not quite true

Three Spec 1 contracts have to widen — a real, if small, diff in the presentational layer:

- **`HiveCardProps.number` is a `number`** and renders bare
  (`app/components/dashboard/HiveCard.tsx:41-56`). This spec passes `hive.label`,
  a string (`"Ul 1"`). Either parse the label to an int or widen the prop to a
  string and drop the card's implicit "Ul " prefix — pick one and stay consistent
  with `AlertCardProps.hiveLabel`, which is already a string.
- **`HiveCardProps.queenStatus` is a required `QueenStatus`** with no null member,
  and `QUEEN_LABELS` has no entry for the absent case
  (`app/components/dashboard/status.ts`). This spec passes `null` → `'Brak przeglądów'`.
  Add the null branch and its muted colour at the card, not a fourth `QueenStatus`
  member — "no inspection" is not a queen state.
- **`HiveStatus` is `'ok' | 'warning' | 'danger'`** — no `'never_inspected'`. This
  spec introduces it, then says treat it as `'ok'` for border colour. Both
  `StrengthDots.FILLED_BY_STATUS` and the card's border map are keyed exhaustively
  by `HiveStatus`, so a fourth member means touching both. Cleaner: leave
  `HiveStatus` alone and carry "never inspected" as the `queenStatus === null`
  signal, which has to exist regardless.

### Ambiguities to settle while implementing

- **Strength scale.** `deriveStrength` returns `frames_covered` (0–10) but
  `StrengthDots` renders 5 dots and clamps, so passing it raw makes every hive
  above 5 frames read as full. This spec says both "direct" and
  `Math.round(frames_covered / 2)` in the same paragraph. Use the halving. Moot
  while nothing is inspected (→ 0), wrong the moment an inspection exists.
- **`getGreeting` has a dead branch** — `hour < 12` and `hour < 18` both return
  `Dzień dobry`. That is correct Polish (no distinct midday greeting), so collapse
  to two branches rather than inventing a third string.
- **A `new Date()` in the render path makes `/dashboard` dynamic.** Spec 1 shipped
  it prerendered static; both the greeting's `getHours()` and `daysSinceInspection`'s
  `Date.now()` break that. Expected — real user data forces dynamic anyway — but
  don't read the build-output change as a regression. Server timezone drives the
  greeting: pin to `Europe/Warsaw` rather than trusting Vercel's UTC default.
- **The meta line** ("5 uli · brak przeglądów · 0 wymaga uwagi") is a third format
  alongside Spec 1's `summary` and `hiveTypeSummary`, and it drops the hive-type
  line. Build it from the counts but keep both lines; don't lose the equivalent of
  `8 uli wielkopolskich`.
- **`DashboardView` needs no `'use client'`.** Nothing in it is interactive;
  `Sidebar` is the only client component in the dashboard, and only for
  `usePathname`. Make it a plain server component taking props, or skip the wrapper
  and keep the markup in the page — the stated goal (a testable presentational
  layer) holds either way.
- **Honey and comb also exist as real scalar columns** — `Inspection.honeyKg`,
  `honeySufficiency`, `combCondition` are denormalized out of the JSON alongside
  `colony.honey_kg` / `colony.honey_stores`. The dashboard needs none of them, but
  don't let `ColonyData` become the assumed source of truth for a value that has a
  typed column.
- **`Inspection` has six JSON columns** — `queen`, `colony`, `comb`, `brood`,
  `health`, `actions`. This spec types two. Putting the interfaces in
  `types/inspection.ts` as it asks gives the other four an obvious home.
- **Subscription tier**: `prisma.subscription.findUnique({ where: { userId } })`.
  The seed sets `PREMIUM` + `active`. The sidebar footer is desktop-only — there is
  no mobile equivalent (a Spec 1 left-open) — so the plan badge simply does not
  appear on phones.
