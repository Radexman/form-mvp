import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { registerSchema } from '../app/lib/auth.schema';
import { hashPassword } from '../app/lib/password';
import { PlanTier, PrismaClient } from '../generated/prisma/client';

/**
 * Creates one real account — user, subscription, usage period and an empty
 * apiary — from environment variables. Written for production, where
 * `prisma/seed.ts` must never run: that script hardcodes `demo1234`.
 *
 * Usage (PowerShell):
 *   $env:TARGET_DATABASE_URL="postgresql://…"   # the PRODUCTION Neon branch
 *   $env:NEW_ACCOUNT_EMAIL="you@example.com"
 *   $env:NEW_ACCOUNT_NAME="Radek Siek"
 *   $env:NEW_ACCOUNT_PASSWORD="…"
 *   npm run db:create-account
 *
 * Optional: NEW_ACCOUNT_TIER (FREE | PREMIUM, default FREE),
 *           NEW_ACCOUNT_APIARY (default "Moja pasieka"),
 *           NEW_ACCOUNT_APIARY_LOCATION.
 */

config({ path: ['.env.local', '.env'], quiet: true });

/**
 * Deliberately NOT `DATABASE_URL`. That variable points at the development
 * branch in `.env.local`, and a script whose whole purpose is to write to
 * production must not silently fall back to it — the failure mode is writing
 * a real account into the wrong database and wondering why sign-in fails.
 */
function requireEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is not set. See the usage block in prisma/create-account.ts.`);
	}

	return value;
}

function createPrismaClient(connectionString: string): PrismaClient {
	const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 10_000, max: 1 });

	return new PrismaClient({ adapter });
}

/** First day of the current calendar month at UTC midnight. */
function currentPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const connectionString = requireEnv('TARGET_DATABASE_URL');

// Validated with the same schema `/api/auth/register` uses, so an account made
// here obeys the rules the app enforces — and, critically, gets the same email
// normalisation. A capitalised address would be written verbatim into a
// case-sensitive unique column and could never be signed in to.
const { name, email, password } = registerSchema.parse({
	name: requireEnv('NEW_ACCOUNT_NAME'),
	email: requireEnv('NEW_ACCOUNT_EMAIL'),
	password: requireEnv('NEW_ACCOUNT_PASSWORD'),
	confirmPassword: requireEnv('NEW_ACCOUNT_PASSWORD'),
});

const tier = process.env.NEW_ACCOUNT_TIER === 'PREMIUM' ? PlanTier.PREMIUM : PlanTier.FREE;
const apiaryName = process.env.NEW_ACCOUNT_APIARY ?? 'Moja pasieka';
const apiaryLocation = process.env.NEW_ACCOUNT_APIARY_LOCATION ?? null;

const prisma = createPrismaClient(connectionString);

async function main() {
	// Echo the destination before writing. Two Neon branches hold the same
	// schema and differ only in the host, so this line is the only cheap way to
	// catch a wrong-database run before it happens.
	const { host, pathname } = new URL(connectionString);
	console.log(`[create-account] Target: ${host}${pathname}`);
	console.log(`[create-account] Account: ${email} (${name}), tier ${tier}`);

	const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

	if (existing) {
		console.log('[create-account] User already exists — skipping. Nothing was written.');
		return;
	}

	const passwordHash = await hashPassword(password);
	const periodStart = currentPeriodStart(new Date());

	await prisma.$transaction(
		async (tx) => {
			const user = await tx.user.create({ data: { email, name, passwordHash } });
			console.log(`[create-account] Created user (id: ${user.id})`);

			await tx.subscription.create({ data: { userId: user.id, tier, status: 'active' } });
			console.log(`[create-account] Created subscription: ${tier}`);

			await tx.usagePeriod.create({ data: { userId: user.id, periodStart } });
			console.log(`[create-account] Created usage period: ${periodStart.toISOString().slice(0, 10)}`);

			// Created even though nothing reads it yet: Dashboard Spec 2 redirects a
			// user with no apiary to `/onboarding`, and that route does not exist.
			// An empty apiary costs one row and avoids a dead end.
			const apiary = await tx.apiary.create({
				data: { userId: user.id, name: apiaryName, location: apiaryLocation },
			});
			console.log(`[create-account] Created apiary: ${apiary.name} (no hives)`);
		},
		// Neon compute can be cold; the 2s/5s defaults are too tight.
		{ maxWait: 10_000, timeout: 20_000 },
	);

	console.log('[create-account] Done.');
}

main()
	.catch((error: unknown) => {
		console.error(error);
		// Not process.exit(1) — that kills the process before $disconnect() runs.
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
