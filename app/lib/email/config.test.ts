import { describe, expect, it } from 'vitest';

import { isEmailVerificationEnabled } from './config';

describe('isEmailVerificationEnabled', () => {
	it('is off when the variable is unset', () => {
		expect(isEmailVerificationEnabled({})).toBe(false);
	});

	it('is off when the variable is empty', () => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: '' })).toBe(false);
	});

	it.each(['true', '1', 'yes', 'on'])('is on for %s', (value) => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: value })).toBe(true);
	});

	it.each(['TRUE', 'True', 'YES', 'On'])('ignores case for %s', (value) => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: value })).toBe(true);
	});

	it.each([' true ', '\ttrue\n'])('ignores surrounding whitespace for %j', (value) => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: value })).toBe(true);
	});

	it.each(['false', '0', 'no', 'off'])('is off for %s', (value) => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: value })).toBe(false);
	});

	// The failure this guards against is a `.env` line like
	// `EMAIL_VERIFICATION_ENABLED="true"` — dotenv strips those quotes, but a
	// value pasted through another tool may keep them, and silently reading as
	// "on" would be worse than reading as "off" only if the default were on.
	it.each(['"true"', "'true'", 'true # enable in prod', 'enabled', 'truthy'])('is off for %j', (value) => {
		expect(isEmailVerificationEnabled({ EMAIL_VERIFICATION_ENABLED: value })).toBe(false);
	});

	it('reads process.env when no environment is passed', () => {
		const original = process.env.EMAIL_VERIFICATION_ENABLED;

		try {
			process.env.EMAIL_VERIFICATION_ENABLED = 'true';
			expect(isEmailVerificationEnabled()).toBe(true);

			delete process.env.EMAIL_VERIFICATION_ENABLED;
			expect(isEmailVerificationEnabled()).toBe(false);
		} finally {
			if (original === undefined) {
				delete process.env.EMAIL_VERIFICATION_ENABLED;
			} else {
				process.env.EMAIL_VERIFICATION_ENABLED = original;
			}
		}
	});
});
