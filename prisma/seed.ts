import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

import { HiveType, PlanTier, PrismaClient } from '../generated/prisma/client';

// `prisma db seed` inherits env from the CLI, but running `tsx prisma/seed.ts`
// directly does not — load the same files prisma.config.ts does.
config({ path: ['.env.local', '.env'], quiet: true });

const DEMO_EMAIL = 'demo@getapiary.app';
const DEMO_NAME = 'Jan Pszczelarz';
const DEMO_PASSWORD = 'demo1234';
const SALT_ROUNDS = 10;

const APIARY_NAME = 'Pasieka Turawa';
const APIARY_LOCATION = 'Turawa, woj. opolskie';
const HIVE_LABELS = ['Ul 1', 'Ul 2', 'Ul 3', 'Ul 4', 'Ul 5'];

const PDF_GENERATIONS_USED = 3;
const AI_REPORTS_USED = 1;

function createPrismaClient(): PrismaClient {
	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
	}

	const adapter = new PrismaPg({
		connectionString,
		connectionTimeoutMillis: 10_000,
		max: 1,
	});

	return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();

/** First day of the current calendar month at UTC midnight. */
function currentPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

async function main() {
	const existing = await prisma.user.findUnique({
		where: { email: DEMO_EMAIL },
		select: { id: true, emailVerified: true },
	});

	if (existing) {
		// The demo account predates email verification, so a seeded database from
		// before this feature would otherwise be parked on /verify-email forever
		// with no inbox to check.
		if (!existing.emailVerified) {
			await prisma.user.update({
				where: { id: existing.id },
				data: { emailVerified: new Date() },
			});
			console.log('[seed] Marked existing demo user as verified.');
		}

		console.log('[seed] Demo user already exists — skipping.');
		return;
	}

	console.log('[seed] Hashing password...');
	const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
	const periodStart = currentPeriodStart(new Date());

	console.log('[seed] Starting transaction...');
	await prisma.$transaction(
		async (tx) => {
			const user = await tx.user.create({
				data: {
					email: DEMO_EMAIL,
					name: DEMO_NAME,
					passwordHash,
					// No inbox to click through; the demo account must reach /dashboard
					// straight after seeding.
					emailVerified: new Date(),
				},
			});
			console.log(`[seed] Created user: ${user.email} (id: ${user.id})`);

			const subscription = await tx.subscription.create({
				data: {
					userId: user.id,
					tier: PlanTier.PREMIUM,
					status: 'active',
				},
			});
			console.log(`[seed] Created subscription: ${subscription.tier}`);

			const usagePeriod = await tx.usagePeriod.create({
				data: {
					userId: user.id,
					periodStart,
					pdfGenerationsUsed: PDF_GENERATIONS_USED,
					aiReportsUsed: AI_REPORTS_USED,
				},
			});
			console.log(`[seed] Created usage period: ${usagePeriod.periodStart.toISOString().slice(0, 10)}`);

			const apiary = await tx.apiary.create({
				data: {
					userId: user.id,
					name: APIARY_NAME,
					location: APIARY_LOCATION,
				},
			});
			console.log(`[seed] Created apiary: ${apiary.name}`);

			await tx.hive.createMany({
				data: HIVE_LABELS.map((label) => ({
					apiaryId: apiary.id,
					label,
					hiveType: HiveType.WIELKOPOLSKI,
				})),
			});
			console.log(`[seed] Created hives: ${HIVE_LABELS.join(', ')}`);
		},
		// Neon compute can be cold; the defaults (2s wait / 5s run) are too tight.
		{ maxWait: 10_000, timeout: 20_000 },
	);

	console.log('[seed] Done.');
}

main()
	.catch((error: unknown) => {
		console.error(error);
		// Not process.exit(1) — that would kill the process before $disconnect() runs.
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
