import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Pure suites (grammar, phrases, derivations, payload) run in node; files
		// that need a DOM opt in with `// @vitest-environment jsdom`, so the jsdom
		// setup cost is not paid by every suite.
		environment: 'node',
		include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
		restoreMocks: true,
	},
});
