import type { ActionsValues } from '@/app/components/inspection/steps/actions/actions.schema';
import type { BroodValues } from '@/app/components/inspection/steps/brood/brood.schema';
import type { ColonyValues } from '@/app/components/inspection/steps/colony/colony.schema';
import type { CombValues } from '@/app/components/inspection/steps/comb/comb.schema';
import type { HealthValues } from '@/app/components/inspection/steps/health/health.schema';
import type { QueenValues } from '@/app/components/inspection/steps/queen/queen.schema';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Shapes of `Inspection`'s six `Json` columns.
 *
 * Prisma types a `Json` column as `JsonValue`, so reading one always needs a
 * cast. These aliases are what that cast should point at — and they are
 * *derived from the form schemas that write the column*, not hand-written
 * alongside them. `buildInspectionPayload` in
 * `app/components/inspection/payload.ts` assembles each block field by field
 * from exactly these objects, so a change to a step's schema shows up here as a
 * type error rather than as a value that quietly stops matching reality.
 *
 * Two places where a hand-written copy would already have been wrong:
 * `colony` carries no honey fields (`honeyKg` / `honeySufficiency` are scalar
 * columns, derived server-side from the comb frames), and `frames_covered` is
 * validated to 0–20, not 0–10.
 */
export type QueenData = QueenValues;
export type ColonyData = ColonyValues;
export type BroodData = BroodValues;
export type CombData = CombValues;
export type HealthData = HealthValues;
export type ActionsData = ActionsValues;

/**
 * A hive with its denormalised latest inspection. `currentInspection` is
 * nullable — a hive that has never been inspected has no pointer — and every
 * derivation in `app/lib/dashboard.ts` has to handle that.
 */
export type HiveWithCurrentInspection = Prisma.HiveGetPayload<{
	include: { currentInspection: true };
}>;

export type ApiaryWithHives = Prisma.ApiaryGetPayload<{
	include: { hives: { include: { currentInspection: true } } };
}>;
