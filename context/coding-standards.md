# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs)
- Use Server Actions for form submissions and simple mutations
- Use API routes when you need:
  - Webhooks (Stripe, GitHub, etc.)
  - File uploads with progress tracking
  - Long-running operations
  - Specific HTTP status codes or headers
  - Endpoints for future mobile/CLI clients
  - Third-party integrations
- Otherwise, fetch data directly in server components
- Dynamic routes for item/collection pages

## Tailwind CSS v4

**CRITICAL**: We are using Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` files (those are for v3)
- All theme configuration must be done in CSS using the `@theme` directive in `src/app/globals.css`
- Use CSS custom properties for colors, spacing, etc.
- No JavaScript-based config allowed

Example v4 configuration:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(50% 0.2 250);
}

## File Organization

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- Server Actions: `src/actions/[feature].ts`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts`

## Naming

- Components: PascalCase (`ItemCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling
- Use ArkUI components where applicable
- No inline styles
- Dark mode first, light mode as option

## Error Handling

- Use try/catch in Server Actions
- Return `{ success, data, error }` pattern from actions
- Display user-friendly error messages via toast
- Use zod to validate form fields

## Testing

- **Vitest** for unit tests (node environment)
- **Scope**: server actions (`src/actions/`) and utilities (`src/lib/`) only — no component tests
- Colocate tests next to source as `*.test.ts` (e.g. `src/lib/format.ts` → `src/lib/format.test.ts`)
- Run with `npm test` (one-shot), `npm run test:watch` (watch mode), `npm run test:coverage`


## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
```

## Repository layout

npm-workspaces monorepo with two apps:

- `frontend/` — Next.js 16 (App Router, React 19, Tailwind v4) public site.
- `studio/` — Sanity Studio v5 (content schema + editing UI).

The schema is authored in `studio/` but **consumed** by `frontend/` through generated TypeScript types. The two are linked by a TypeGen pipeline (see below), not by shared imports.

## Commands

Run from the repo root (workspace-aware):

```bash
npm run dev          # runs frontend (:3000) + studio (:3333) concurrently
npm run lint         # eslint, frontend only
npm run type-check   # tsc across both workspaces
npm run format       # prettier (@sanity/prettier-config)
npm run import-sample-data   # imports studio/sample-data.tar.gz into the dataset
```

Per-app (from `frontend/` or `studio/`):

```bash
npm run dev          # single app dev server
npm run build        # frontend: next build (studio: sanity build)
npx tsc --noEmit     # type-check one app
```

There is **no test runner** configured in this repo.

## TypeGen pipeline (read before changing schema or queries)

Frontend code is typed against `frontend/sanity.types.ts`, which is generated — never hand-edit it. The flow:

1. `sanity schema extract` (in `studio/`) writes `sanity.schema.json` at the repo root.
2. `sanity typegen generate` (in `frontend/`) scans GROQ queries and regenerates `frontend/sanity.types.ts`.

Both steps are wrapped in `frontend`'s `sanity:typegen` script, and run automatically via `predev`/`prebuild`. **After editing any schema file or any GROQ query, regenerate types** or `tsc` will be stale/wrong:

```bash
cd frontend && npm run sanity:typegen
```

GROQ queries must be wrapped in `defineQuery` (in `frontend/sanity/lib/queries.ts`) for TypeGen to pick them up and for `sanityFetch` to return typed results. Query result types are named `<QueryVar>Result`. Extraction uses `--enforce-required-fields`, so `validation: rule.required()` becomes a non-optional type.

## Data flow & architecture

**Fetching:** All reads go through `sanityFetch` from `frontend/sanity/lib/live.ts` (built on `next-sanity`'s `defineLive`). `<SanityLive>` is rendered once in `frontend/app/layout.tsx` and makes every `sanityFetch` call live-updating. Don't introduce ad-hoc `client.fetch` for page data — use `sanityFetch` so live + draft behavior is preserved.

**Visual editing / Presentation:** The Studio's Presentation tool loads the frontend in an iframe and drives draft mode via `frontend/app/api/draft-mode/enable`. In the frontend, draft mode conditionally renders `<VisualEditing>` and `<DraftModeToast>`. To make a rendered field click-to-edit, attach a `data-sanity` attribute built with `dataAttr({id, type, path})` from `frontend/sanity/lib/utils.ts` (see `frontend/app/page.tsx` for the pattern).

**Presentation resolvers** live in `studio/sanity.config.ts` (`mainDocuments` route→document filters, and `locations` for "used on these pages"). These must be kept in sync with the frontend's routes and the schema when document types change.

**Settings singleton:** There is one `settings` document with the fixed id `siteSettings`. It's surfaced as a single "Site Settings" entry via `studio/src/structure/index.ts` (not as a creatable list). `settingsQuery` powers site metadata (`generateMetadata` in layout), the header, and the homepage `heading`.

**Studio schema** is registered in `studio/src/schemaTypes/index.ts` and organized under `documents/`, `objects/`, and `singletons/`. Use `defineType`/`defineField`/`defineArrayMember` and assign an `@sanity/icons` icon to document/object types.

## Environment

`frontend/.env.local` (see `frontend/.env.example`): `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_READ_TOKEN` are required; `NEXT_PUBLIC_SANITY_API_VERSION`, `NEXT_PUBLIC_SANITY_STUDIO_URL` optional. Studio reads `SANITY_STUDIO_PROJECT_ID` / `SANITY_STUDIO_DATASET` / `SANITY_STUDIO_PREVIEW_URL` (`studio/.env`). `frontend/sanity/lib/api.ts` throws on missing required vars.
