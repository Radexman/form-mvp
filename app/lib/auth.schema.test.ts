import { describe, expect, it } from 'vitest';

import {
	forgotPasswordSchema,
	MIN_PASSWORD_LENGTH,
	PASSWORD_REQUIREMENTS,
	registerSchema,
	resetPasswordRequestSchema,
	resetPasswordSchema,
	signInSchema,
} from './auth.schema';

/** Satisfies every rule: 16 characters, mixed case, a digit, no weak base. */
const STRONG = 'Bezpieczne9Klucz';

const VALID_REGISTER = {
	name: 'Jan Pszczelarz',
	email: 'jan@pasieka.pl',
	password: STRONG,
	confirmPassword: STRONG,
};

/** First message for a field, or undefined when that field parsed cleanly. */
function messageFor(result: { success: boolean; error?: unknown }, path: string): string | undefined {
	if (result.success) return undefined;

	const { issues } = result.error as { issues: { path: PropertyKey[]; message: string }[] };

	return issues.find((issue) => issue.path.join('.') === path)?.message;
}

function messagesFor(result: { success: boolean; error?: unknown }, path: string): string[] {
	if (result.success) return [];

	const { issues } = result.error as { issues: { path: PropertyKey[]; message: string }[] };

	return issues.filter((issue) => issue.path.join('.') === path).map((issue) => issue.message);
}

const withPassword = (password: string) => ({ ...VALID_REGISTER, password, confirmPassword: password });

describe('email normalisation', () => {
	it('lowercases, so a capitalised address cannot become a second row', () => {
		expect(signInSchema.parse({ email: 'Jan@Pasieka.PL', password: 'x' }).email).toBe('jan@pasieka.pl');
	});

	it('trims before validating, so a pasted address with spaces is accepted', () => {
		expect(signInSchema.parse({ email: '  jan@pasieka.pl  ', password: 'x' }).email).toBe('jan@pasieka.pl');
	});

	it('rejects a malformed address', () => {
		expect(messageFor(signInSchema.safeParse({ email: 'nie-email', password: 'x' }), 'email')).toBe(
			'Nieprawidłowy adres e-mail',
		);
	});

	it('rejects a blank address', () => {
		expect(signInSchema.safeParse({ email: '   ', password: 'x' }).success).toBe(false);
	});
});

describe('signInSchema', () => {
	// Sign-in must keep working for every password already in the database,
	// including ones set before the strength rules existed.
	it('accepts a weak legacy password that registration would now reject', () => {
		expect(signInSchema.safeParse({ email: 'jan@pasieka.pl', password: 'demo1234' }).success).toBe(true);
	});

	it('rejects an empty password', () => {
		expect(messageFor(signInSchema.safeParse({ email: 'jan@pasieka.pl', password: '' }), 'password')).toBe(
			'Hasło jest wymagane',
		);
	});
});

describe('PASSWORD_REQUIREMENTS', () => {
	it('is satisfied in full by the strong fixture', () => {
		expect(PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(STRONG))).toBe(true);
	});

	it('is satisfied by none of an empty password', () => {
		expect(PASSWORD_REQUIREMENTS.some((requirement) => requirement.test(''))).toBe(false);
	});

	it('counts Polish letters as case, not just A-Z', () => {
		const caseRule = PASSWORD_REQUIREMENTS[1];

		expect(caseRule.test('ĄĆĘŁŃÓŚŻŹ')).toBe(false);
		expect(caseRule.test('Ąćęłńóśżź')).toBe(true);
	});

	it('every requirement carries both a label and a message', () => {
		for (const requirement of PASSWORD_REQUIREMENTS) {
			expect(requirement.label.length).toBeGreaterThan(0);
			expect(requirement.message.length).toBeGreaterThan(0);
		}
	});
});

describe('registerSchema', () => {
	it('accepts a well-formed registration', () => {
		expect(registerSchema.safeParse(VALID_REGISTER).success).toBe(true);
	});

	it('trims the name', () => {
		expect(registerSchema.parse({ ...VALID_REGISTER, name: '  Jan  ' }).name).toBe('Jan');
	});

	it('rejects a one-character name', () => {
		expect(messageFor(registerSchema.safeParse({ ...VALID_REGISTER, name: 'J' }), 'name')).toBe(
			'Imię musi mieć co najmniej 2 znaki',
		);
	});

	it('rejects a name past 100 characters', () => {
		expect(registerSchema.safeParse({ ...VALID_REGISTER, name: 'a'.repeat(101) }).success).toBe(false);
	});

	it('measures the name after trimming', () => {
		expect(registerSchema.safeParse({ ...VALID_REGISTER, name: ` ${'a'.repeat(100)} ` }).success).toBe(true);
	});

	it('rejects a password one character short', () => {
		const short = `Aa1${'b'.repeat(MIN_PASSWORD_LENGTH - 4)}`;

		expect(short).toHaveLength(MIN_PASSWORD_LENGTH - 1);
		expect(messageFor(registerSchema.safeParse(withPassword(short)), 'password')).toBe(
			`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
		);
	});

	it('accepts a password of exactly the minimum length', () => {
		const exact = `Aa1${'b'.repeat(MIN_PASSWORD_LENGTH - 3)}`;

		expect(exact).toHaveLength(MIN_PASSWORD_LENGTH);
		expect(registerSchema.safeParse(withPassword(exact)).success).toBe(true);
	});

	it('rejects a password with no capital letter', () => {
		expect(messageFor(registerSchema.safeParse(withPassword('bezpieczne9klucz')), 'password')).toBe(
			'Hasło musi zawierać wielką i małą literę',
		);
	});

	it('rejects a password with no lowercase letter', () => {
		expect(messageFor(registerSchema.safeParse(withPassword('BEZPIECZNE9KLUCZ')), 'password')).toBe(
			'Hasło musi zawierać wielką i małą literę',
		);
	});

	it('rejects a password with no digit', () => {
		expect(messageFor(registerSchema.safeParse(withPassword('BezpieczneKlucze')), 'password')).toBe(
			'Hasło musi zawierać co najmniej jedną cyfrę',
		);
	});

	it('reports every unmet rule at once, not just the first', () => {
		expect(messagesFor(registerSchema.safeParse(withPassword('krotkie')), 'password')).toHaveLength(3);
	});

	it('accepts 72 bytes, the point at which bcrypt truncates', () => {
		const exact = `A${'b'.repeat(70)}1`;

		expect(exact).toHaveLength(72);
		expect(registerSchema.safeParse(withPassword(exact)).success).toBe(true);
	});

	it('rejects 73 bytes', () => {
		const long = `A${'b'.repeat(71)}1`;

		expect(messageFor(registerSchema.safeParse(withPassword(long)), 'password')).toBe('Hasło jest za długie');
	});

	// The ceiling is bytes, not characters: a Polish letter costs two.
	it('accepts 37 characters that come to exactly 72 bytes', () => {
		const polish = `Ą${'ą'.repeat(34)}12`;

		expect(new TextEncoder().encode(polish)).toHaveLength(72);
		expect(registerSchema.safeParse(withPassword(polish)).success).toBe(true);
	});

	it('rejects 37 characters that come to 73 bytes', () => {
		const polish = `Ą${'ą'.repeat(35)}1`;

		expect(new TextEncoder().encode(polish)).toHaveLength(73);
		expect(messageFor(registerSchema.safeParse(withPassword(polish)), 'password')).toBe('Hasło jest za długie');
	});

	it('rejects a common base even when every composition rule passes', () => {
		const result = registerSchema.safeParse(withPassword('Password12345'));

		expect(PASSWORD_REQUIREMENTS.every((requirement) => requirement.test('Password12345'))).toBe(true);
		expect(messageFor(result, 'password')).toBe('Hasło zawiera zbyt popularne słowo — wybierz inne');
	});

	it('catches a weak base regardless of case or surrounding characters', () => {
		expect(registerSchema.safeParse(withPassword('xxQwErTy123456')).success).toBe(false);
	});

	it('catches the words this app puts in a beekeeper mind', () => {
		expect(registerSchema.safeParse(withPassword('MojaPasieka2026')).success).toBe(false);
		expect(registerSchema.safeParse(withPassword('Hivewise12345A')).success).toBe(false);
	});

	it('attaches a mismatch to confirmPassword, the field the user can fix', () => {
		const result = registerSchema.safeParse({ ...VALID_REGISTER, confirmPassword: 'CosInnego9Tutaj' });

		expect(messageFor(result, 'confirmPassword')).toBe('Hasła nie są identyczne');
		expect(messageFor(result, 'password')).toBeUndefined();
	});

	it('does not trim the password — a trailing space is part of it', () => {
		expect(registerSchema.safeParse({ ...VALID_REGISTER, password: `${STRONG} ` }).success).toBe(false);
	});
});

describe('forgotPasswordSchema', () => {
	it('normalises the address the same way the rest of auth does', () => {
		expect(forgotPasswordSchema.parse({ email: '  Jan@Pasieka.PL ' }).email).toBe('jan@pasieka.pl');
	});

	it('rejects a malformed address', () => {
		expect(forgotPasswordSchema.safeParse({ email: 'nie-email' }).success).toBe(false);
	});

	it('ignores anything else in the payload', () => {
		expect(forgotPasswordSchema.safeParse({ email: 'jan@pasieka.pl', token: 'x' }).success).toBe(true);
	});
});

describe('resetPasswordSchema', () => {
	it('accepts a matching pair', () => {
		expect(resetPasswordSchema.safeParse({ password: STRONG, confirmPassword: STRONG }).success).toBe(true);
	});

	it('enforces the same rules as registration', () => {
		for (const weak of ['krotkie', 'bezpieczne9klucz', 'BezpieczneKlucze', 'Password12345']) {
			expect(resetPasswordSchema.safeParse({ password: weak, confirmPassword: weak }).success).toBe(false);
		}
	});

	it('enforces the same 72-byte ceiling as registration', () => {
		const long = `A${'b'.repeat(71)}1`;

		expect(resetPasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
	});

	it('attaches a mismatch to confirmPassword', () => {
		const result = resetPasswordSchema.safeParse({ password: STRONG, confirmPassword: 'InneHaslo9Tutaj' });

		expect(messageFor(result, 'confirmPassword')).toBe('Hasła nie są identyczne');
	});

	// The form binds this one; the token rides in a prop, not a field.
	it('carries no token field', () => {
		const parsed = resetPasswordSchema.parse({ password: STRONG, confirmPassword: STRONG });

		expect(Object.keys(parsed)).toEqual(['password', 'confirmPassword']);
	});
});

describe('resetPasswordRequestSchema', () => {
	const VALID = { token: 'a'.repeat(64), password: STRONG, confirmPassword: STRONG };

	it('accepts a well-formed request', () => {
		expect(resetPasswordRequestSchema.safeParse(VALID).success).toBe(true);
	});

	it('rejects a missing token', () => {
		expect(resetPasswordRequestSchema.safeParse({ ...VALID, token: undefined }).success).toBe(false);
	});

	it('rejects an empty token', () => {
		expect(messageFor(resetPasswordRequestSchema.safeParse({ ...VALID, token: '' }), 'token')).toBe(
			'Brak tokenu resetowania hasła',
		);
	});

	it('applies the same password rules as the form schema', () => {
		expect(
			resetPasswordRequestSchema.safeParse({ ...VALID, password: 'krotkie', confirmPassword: 'krotkie' }).success,
		).toBe(false);
	});

	it('applies the same mismatch rule as the form schema', () => {
		const result = resetPasswordRequestSchema.safeParse({ ...VALID, confirmPassword: 'InneHaslo9Tutaj' });

		expect(messageFor(result, 'confirmPassword')).toBe('Hasła nie są identyczne');
	});
});
