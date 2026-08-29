import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGN_IN_REDIRECT, safeCallbackUrl } from './callback-url';

describe('safeCallbackUrl', () => {
	it('keeps a root-relative path', () => {
		expect(safeCallbackUrl('/dashboard/hive/42')).toBe('/dashboard/hive/42');
	});

	it('keeps a path with a query string and a fragment', () => {
		expect(safeCallbackUrl('/dashboard?tab=alerts#top')).toBe('/dashboard?tab=alerts#top');
	});

	it.each([undefined, null, ''])('falls back when nothing was asked for (%p)', (value) => {
		expect(safeCallbackUrl(value)).toBe(DEFAULT_SIGN_IN_REDIRECT);
	});

	it.each([
		['an absolute https url', 'https://evil.example/take-over'],
		['a protocol-relative url', '//evil.example'],
		['a backslash protocol-relative url', '/\\evil.example'],
		['a javascript: url', 'javascript:alert(1)'],
		['a data: url', 'data:text/html,<script>alert(1)</script>'],
		['a bare path', 'dashboard'],
	])('rejects %s', (_label, value) => {
		expect(safeCallbackUrl(value)).toBe(DEFAULT_SIGN_IN_REDIRECT);
	});
});
