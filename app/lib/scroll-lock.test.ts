// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { lockBodyScroll, releaseAllScrollLocks, scrollLockDepth } from './scroll-lock';

beforeEach(() => {
	releaseAllScrollLocks();
	document.body.style.overflow = '';
});

describe('lockBodyScroll', () => {
	it('locks the body and releases it again', () => {
		const release = lockBodyScroll();
		expect(document.body.style.overflow).toBe('hidden');

		release();
		expect(document.body.style.overflow).toBe('');
	});

	it('counts, so the first release does not unlock the second locker', () => {
		const first = lockBodyScroll();
		const second = lockBodyScroll();
		expect(scrollLockDepth()).toBe(2);

		first();
		expect(document.body.style.overflow).toBe('hidden');

		second();
		expect(document.body.style.overflow).toBe('');
	});

	it('releases out of order without stranding the lock', () => {
		const first = lockBodyScroll();
		const second = lockBodyScroll();

		second();
		expect(document.body.style.overflow).toBe('hidden');

		first();
		expect(document.body.style.overflow).toBe('');
	});

	// React invokes an effect's cleanup more than once under StrictMode, and a
	// double release that decremented twice would unlock a still-open panel.
	it('ignores a repeated release', () => {
		const release = lockBodyScroll();
		const other = lockBodyScroll();

		release();
		release();
		release();
		expect(scrollLockDepth()).toBe(1);
		expect(document.body.style.overflow).toBe('hidden');

		other();
		expect(document.body.style.overflow).toBe('');
	});

	it('never drives the depth below zero', () => {
		const release = lockBodyScroll();
		release();
		release();

		expect(scrollLockDepth()).toBe(0);
	});

	// The whole point of counting rather than capturing: restoring a remembered
	// value would hand the second locker 'hidden' to put back.
	it('restores an empty overflow rather than whatever it found', () => {
		document.body.style.overflow = 'hidden';

		const release = lockBodyScroll();
		release();

		expect(document.body.style.overflow).toBe('');
	});

	it('re-locks cleanly after a full release', () => {
		lockBodyScroll()();
		const again = lockBodyScroll();

		expect(document.body.style.overflow).toBe('hidden');
		expect(scrollLockDepth()).toBe(1);
		again();
	});
});

describe('releaseAllScrollLocks', () => {
	it('drops every outstanding lock at once', () => {
		lockBodyScroll();
		lockBodyScroll();
		lockBodyScroll();

		releaseAllScrollLocks();

		expect(scrollLockDepth()).toBe(0);
		expect(document.body.style.overflow).toBe('');
	});

	it('leaves a later lock working', () => {
		lockBodyScroll();
		releaseAllScrollLocks();

		const release = lockBodyScroll();
		expect(document.body.style.overflow).toBe('hidden');

		release();
		expect(document.body.style.overflow).toBe('');
	});

	// A release handed out before the reset must not decrement the new count.
	it('is not undone by a stale release from before it ran', () => {
		const stale = lockBodyScroll();
		releaseAllScrollLocks();

		lockBodyScroll();
		stale();

		expect(document.body.style.overflow).toBe('hidden');
	});

	it('is safe with nothing locked', () => {
		releaseAllScrollLocks();
		expect(document.body.style.overflow).toBe('');
	});
});

describe('a stale release from before a reset', () => {
	// Without the epoch this drives the count to -1, and the *next* lock then
	// finds a non-zero depth and never sets `overflow: hidden` at all.
	it('cannot disable the next lock', () => {
		const stale = lockBodyScroll();
		releaseAllScrollLocks();
		stale();

		const release = lockBodyScroll();
		expect(scrollLockDepth()).toBe(1);
		expect(document.body.style.overflow).toBe('hidden');

		release();
		expect(document.body.style.overflow).toBe('');
	});
});
