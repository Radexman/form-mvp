import z from 'zod';

/**
 * Shared validation for the two credentials entry points: the registration
 * route handler and the `authorize` callback in `auth.ts`. Phase 3's sign-in
 * and register forms bind to the same schemas, so a rule written here is
 * enforced on both sides of the wire rather than duplicated.
 *
 * Messages are Polish — they surface directly in the UI, like the inspection
 * step schemas.
 */

/**
 * Normalises before validating, not after. `z.email().trim()` would run the
 * format check first and reject a pasted address with a trailing space, so the
 * transforms are piped *into* the check instead.
 *
 * Normalising is not cosmetic: `User.email` is `@unique` in Postgres, which
 * compares case-sensitively. Without a canonical form `Jan@example.com` and
 * `jan@example.com` are two rows, and whoever registered with a capital letter
 * could never sign in by typing their address in lowercase.
 */
const email = z.string().trim().toLowerCase().pipe(z.email('Nieprawidłowy adres e-mail'));

export const signInSchema = z.object({
	email,
	// Presence only. Sign-in must keep working for any password already in the
	// database, including ones that predate — or outlive — the rules below;
	// strength is the register route's business.
	password: z.string().min(1, 'Hasło jest wymagane'),
});

export type SignInValues = z.infer<typeof signInSchema>;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * bcrypt hashes at most 72 *bytes* and silently discards the rest, so two
 * passwords sharing a 72-byte prefix would authenticate each other. The limit
 * is measured in bytes, not characters — "ą" costs two.
 */
const MAX_PASSWORD_BYTES = 72;

export const registerSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, 'Imię musi mieć co najmniej 2 znaki')
			.max(100, 'Imię może mieć maksymalnie 100 znaków'),
		email,
		password: z
			.string()
			.min(MIN_PASSWORD_LENGTH, `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`)
			.refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, 'Hasło jest za długie'),
		confirmPassword: z.string(),
	})
	.refine((values) => values.password === values.confirmPassword, {
		message: 'Hasła nie są identyczne',
		// Attaches the error to the second field, which is the one the user can
		// fix without retyping both.
		path: ['confirmPassword'],
	});

export type RegisterValues = z.infer<typeof registerSchema>;
