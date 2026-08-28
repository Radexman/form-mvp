# Dashboard Spec 1 — Static Layout

## Scope

Build the post-login dashboard page as a static, correctly-styled shell.
No data fetching, no server actions, no database calls in this spec.
All values are hardcoded from the mock below.
Spec 2 will wire up real data from the seeded user.

---

## Route

`app/(dashboard)/dashboard/page.tsx`

The `(dashboard)` route group wraps all authenticated pages and owns the
sidebar layout. If it doesn't exist yet, create it with a shared
`layout.tsx` that renders the sidebar + main area shell.

---

## File structure to create

```
app/
└── (dashboard)/
    ├── layout.tsx          ← sidebar shell, shared across all dashboard routes
    └── dashboard/
        └── page.tsx        ← dashboard page, static for now
components/
└── dashboard/
    ├── Sidebar.tsx
    ├── Topbar.tsx
    ├── AlertCard.tsx
    └── HiveCard.tsx
```

---

## Design tokens

Use the existing `globals.css` token set. Do not hardcode hex values — use
CSS custom properties. The color system is already defined:

```css
--background:  #0d0f0d
--surface:     #141814
--surface-2:   #1a1f1a
--surface-3:   #202620
--accent:      #4ade80    /* green — primary CTA, active nav, status OK */
--accent-warm: #fbbf24    /* amber — warning status */
--danger:      #f87171    /* red — alarm status */
--foreground:  #e8f0e8
--muted:       #6b7d6b
--border:      rgba(255,255,255,0.06)
--border-2:    rgba(255,255,255,0.10)
--font-mono:   'DM Mono', monospace
```

---

## Layout structure

```
┌─────────────────────────────────────────────────────┐
│ sidebar (192px, fixed)  │  main (flex-1, scrollable) │
│                         │  ┌─────────────────────── │
│  logo                   │  │ topbar (sticky)         │
│  nav items              │  ├─────────────────────── │
│                         │  │ content                 │
│  [footer: avatar]       │  │  page header            │
│                         │  │  alerts section         │
│                         │  │  hive grid              │
└─────────────────────────────────────────────────────┘
```

Full viewport height (`100vh`). Sidebar does not scroll.
Main area scrolls independently.

---

## Sidebar (`components/dashboard/Sidebar.tsx`)

### Logo

```tsx
<div className="logo">
  {/* hexagon mark filled with --accent green */}
  <div className="logo-mark">
    <HexIcon />   {/* simple SVG hexagon, stroke #0d0f0d, fill var(--accent) */}
  </div>
  <span>Hivewise</span>
</div>
```

### Nav items

Three items, each `<Link>` with active state driven by `usePathname()`:

| Label      | Icon (Tabler or custom SVG outline) | href             |
|------------|--------------------------------------|-----------------|
| Pasieka    | grid-2x2                             | /apiary         |
| Analityka  | chart-line                           | /analytics      |
| Ustawienia | user-circle                          | /settings       |

Active item: `border-left: 2px solid var(--accent)` + `background: rgba(74,222,128,0.05)` + `color: var(--foreground)`.
Inactive: `color: var(--muted)`, no left border (use `border-left: 2px solid transparent` to prevent layout shift).

### Footer

Avatar circle with initials + name + plan badge:

```tsx
<div className="sidebar-footer">
  <div className="avatar">RS</div>
  <div>
    <p className="avatar-name">Radosław S.</p>
    <p className="avatar-plan">Premium</p>   {/* color: var(--accent) */}
  </div>
</div>
```

---

## Topbar (`components/dashboard/Topbar.tsx`)

Sticky, `z-index: 10`, `background: var(--surface)`, `border-bottom: 1px solid var(--border)`.

```
[apiary name · location]          [Dodaj ul]  [+ Nowy przegląd]
```

Left: apiary name in `font-weight: 500`, location in `color: var(--muted) font-size: 12px`.
Right: two buttons.

### Button styles

Secondary (Dodaj ul):
- `background: var(--surface-2)`
- `border: 1px solid var(--border-2)`
- `color: var(--muted)`
- hover: `color: var(--foreground)`, `border-color: rgba(255,255,255,0.15)`

Primary (Nowy przegląd):
- `background: var(--accent)`
- `color: #0d0f0d`
- `font-weight: 600`
- hover: `background: #22c55e`

Both: `border-radius: 7px`, `font-size: 12px`, `padding: 6px 12px`,
`display: flex`, `align-items: center`, `gap: 6px`.

SVG plus icon: `width: 13px`, `height: 13px`, `stroke: currentColor`,
`fill: none`, `stroke-width: 2`, `stroke-linecap: round`.

---

## Content area

`padding: 24px`. No max-width — fills available space.

### Page header

```tsx
<div className="page-header">
  <div>
    <h1>Dzień dobry, Radek</h1>        {/* 20px, font-weight 600, letter-spacing -0.02em */}
    <p className="page-meta">           {/* 12px, var(--muted), font-family mono */}
      8 uli · ostatni przegląd 10 cze 2026 · 2 wymagają uwagi
    </p>
  </div>
</div>
```

---

### Alerts section

Section label: `10px, font-weight 600, letter-spacing 0.09em, text-transform uppercase, color: var(--muted)`.

3-column grid, `gap: 8px`, `margin-bottom: 24px`.

#### `AlertCard` component

Props:
```ts
interface AlertCardProps {
  hiveLabel: string        // "Ul 3"
  variant: 'warning' | 'danger'
  description: string
  strength: number         // 1–5
  date: string             // "8 cze 2026"
}
```

Structure:
```tsx
<div className={`alert-card ${variant}`}>
  <div className="alert-top">
    <span className="alert-hive">{hiveLabel}</span>
    <Badge variant={variant}>{variant === 'warning' ? 'Uwaga' : 'Alarm'}</Badge>
  </div>
  <p className="alert-desc">{description}</p>
  <StrengthDots value={strength} variant={variant} />
  <p className="alert-date">{date}</p>
</div>
```

Styling:
- `background: var(--surface)`
- `border: 1px solid var(--border)`
- `border-radius: 10px`
- `padding: 12px 14px`
- warning variant: `border-left: 2px solid var(--accent-warm)` (override left border only)
- danger variant: `border-left: 2px solid var(--danger)`
- hover: `border-color: var(--border-2)`

Badge:
- warning: `background: rgba(251,191,36,0.12)`, `color: var(--accent-warm)`
- danger: `background: rgba(248,113,113,0.12)`, `color: var(--danger)`
- `font-size: 10px`, `font-weight: 600`, `padding: 2px 7px`, `border-radius: 4px`

#### StrengthDots component

5 dots, filled count = `value` prop.
- `width: 9px`, `height: 9px`, `border-radius: 50%`
- empty: `border: 1px solid var(--surface-3)`
- ok (green): `background: var(--accent)`, `border-color: var(--accent)`
- warn (amber): `background: var(--accent-warm)`, `border-color: var(--accent-warm)`
- danger (red): `background: var(--danger)`, `border-color: var(--danger)`

#### Hardcoded alerts data

```ts
const alerts = [
  {
    hiveLabel: 'Ul 3',
    variant: 'warning',
    description: 'Matka niewidziana, czerw OK',
    strength: 3,
    date: '8 cze 2026',
  },
  {
    hiveLabel: 'Ul 4',
    variant: 'danger',
    description: 'Brak matki · mateczniki rojowe',
    strength: 2,
    date: '29 maj 2026',
  },
  {
    hiveLabel: 'Ul 8',
    variant: 'warning',
    description: 'Przegląd przeterminowany · 26 dni',
    strength: 3,
    date: '2 cze 2026',
  },
]
```

---

### Hive grid section

Section label: `Ule` (same style as above).
Subtitle: `8 uli wielkopolskich` — `font-size: 12px`, `color: var(--muted)`, `margin-bottom: 16px`.

Grid: `grid-template-columns: repeat(4, 1fr)`, `gap: 8px`.

#### `HiveCard` component

Props:
```ts
interface HiveCardProps {
  number: number
  queenStatus: 'seen' | 'not_seen_brood_ok' | 'missing'
  strength: number       // 1–5
  lastInspection: string // "10 cze 2026"
  status: 'ok' | 'warning' | 'danger'
}
```

Structure:
```tsx
<div className={`hive-card ${status}`}>
  <div className="hive-card-top">
    <div>
      <p className="hive-num">{number}</p>
      <p className={`hive-queen ${status}`}>{queenLabel}</p>
    </div>
    <div className={`status-dot ${status}`} />
  </div>
  <StrengthDots value={strength} variant={status} />
  <div className="hive-footer">
    <p className="hive-date">{lastInspection}</p>
    <div className="hive-actions">
      <button className="btn-xs">Szczegóły</button>
      <button className="btn-xs primary">Przegląd</button>
    </div>
  </div>
</div>
```

Queen label mapping:
```ts
const queenLabels = {
  seen:              'Matka widziana',
  not_seen_brood_ok: 'Niewidziana, OK',
  missing:           'Brak matki',
}
```

Queen label color:
- `seen` → `color: var(--accent)`
- `not_seen_brood_ok` → `color: var(--accent-warm)`
- `missing` → `color: var(--danger)`

Card styling:
- `background: var(--surface)`
- `border: 1px solid var(--border)`
- `border-radius: 10px`
- `padding: 14px`
- `display: flex`, `flex-direction: column`, `gap: 10px`
- warning: `border-top: 2px solid var(--accent-warm)`
- danger: `border-top: 2px solid var(--danger)`
- ok: no override (default border)
- hover: `border-color: var(--border-2)`

Hive number: `font-size: 22px`, `font-weight: 600`, `font-family: var(--font-mono)`, `letter-spacing: -0.03em`.

Status dot: `width: 7px`, `height: 7px`, `border-radius: 50%`, `margin-top: 6px`, `flex-shrink: 0`.

Btn-xs (Szczegóły):
- `flex: 1`, `padding: 5px 0`, `border-radius: 6px`, `font-size: 11px`, `font-weight: 500`
- `border: 1px solid var(--border-2)`, `background: transparent`, `color: var(--muted)`
- hover: `color: var(--foreground)`, `border-color: rgba(255,255,255,0.15)`

Btn-xs primary (Przegląd):
- `background: var(--accent)`, `color: #0d0f0d`, `border-color: transparent`, `font-weight: 600`
- hover: `background: #22c55e`

#### Hardcoded hives data

```ts
const hives = [
  { number: 1, queenStatus: 'seen',              strength: 4, lastInspection: '10 cze 2026', status: 'ok'      },
  { number: 2, queenStatus: 'seen',              strength: 5, lastInspection: '10 cze 2026', status: 'ok'      },
  { number: 3, queenStatus: 'not_seen_brood_ok', strength: 3, lastInspection: '8 cze 2026',  status: 'warning' },
  { number: 4, queenStatus: 'missing',           strength: 2, lastInspection: '29 maj 2026', status: 'danger'  },
  { number: 5, queenStatus: 'seen',              strength: 5, lastInspection: '10 cze 2026', status: 'ok'      },
  { number: 6, queenStatus: 'seen',              strength: 4, lastInspection: '10 cze 2026', status: 'ok'      },
  { number: 7, queenStatus: 'seen',              strength: 5, lastInspection: '9 cze 2026',  status: 'ok'      },
  { number: 8, queenStatus: 'not_seen_brood_ok', strength: 3, lastInspection: '2 cze 2026',  status: 'warning' },
]
```

---

## Acceptance criteria

- [ ] Page renders without errors at `/dashboard`
- [ ] Sidebar is fixed at 192px, does not scroll with content
- [ ] Active nav item has green left border, correct background tint
- [ ] Topbar is sticky — stays visible when content scrolls
- [ ] "Dodaj ul" button renders as secondary, "Nowy przegląd" as primary green
- [ ] Alerts section shows 3 cards in a row, warning/danger left border correct
- [ ] Hive grid is 4 columns, 8 cards
- [ ] Warning hives (3, 8) have amber top border
- [ ] Danger hive (4) has red top border
- [ ] OK hives (1, 2, 5, 6, 7) have no colored border
- [ ] StrengthDots color matches card status (green/amber/red)
- [ ] Queen label color matches status
- [ ] "Przegląd" button is green on every hive card
- [ ] No TypeScript errors, no console errors
- [ ] No hardcoded hex values — all colors via CSS custom properties

---

## What this spec does NOT cover

- Auth guard / redirect (handled in Spec 2)
- Session / user data fetching
- Real apiary / hive data from database
- Click handlers on buttons (Spec 2+)
- Responsive / mobile layout (separate spec)
- Analytics and Settings pages (separate specs)

## Reference

Use these files as visual reference

- screenshots/dashboard.png
- templates/dashboard.html