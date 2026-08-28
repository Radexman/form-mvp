import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		// Vite does not read tsconfig `paths`, so the `@/*` alias Next.js
		// resolves natively has to be restated here. Without it any suite that
		// reaches app/lib/prisma.ts fails to import the generated Prisma client.
		alias: {
			'@': projectRoot,
		},
	},
	test: {
		// Pure suites (grammar, phrases, derivations, payload) run in node; files
		// that need a DOM opt in with `// @vitest-environment jsdom`, so the jsdom
		// setup cost is not paid by every suite.
		environment: 'node',
		include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
		restoreMocks: true,
	},
});
