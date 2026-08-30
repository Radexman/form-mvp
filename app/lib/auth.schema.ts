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

export const MIN_PASSWORD_LENGTH = 12;

/**
 * bcrypt hashes at most 72 *bytes* and silently discards the rest, so two
 * passwords sharing a 72-byte prefix would authenticate each other. The limit
 * is measured in bytes, not characters — "ą" costs two.
 */
const MAX_PASSWORD_BYTES = 72;

/**
 * The rules a new password must satisfy, paired with the label the form shows.
 * One list drives both the Zod checks and the on-screen checklist, so the two
 * cannot drift into telling the user different things.
 *
 * Letter classes use Unicode property escapes rather than `[A-Z]`: this is a
 * Polish app, and `Ą` has to count as a capital.
 */
export const PASSWORD_REQUIREMENTS = [
	{
		label: `Co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
		message: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
		test: (value: string) => value.length >= MIN_PASSWORD_LENGTH,
	},
	{
		label: 'Wielka i mała litera',
		message: 'Hasło musi zawierać wielką i małą literę',
		test: (value: string) => /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value),
	},
	{
		label: 'Co najmniej jedna cyfra',
		message: 'Hasło musi zawierać co najmniej jedną cyfrę',
		test: (value: string) => /\d/.test(value),
	},
] as const;

/**
 * Rejecting known-weak bases is the one rule NIST SP 800-63B actually endorses;
 * the composition rules above are the ones it warns push people towards
 * `Passwordi1`. Matching on a *substring* is deliberate — `Haslo123456` passes
 * every check above and is exactly what this is here to stop. Includes the
 * words this app puts in a beekeeper's head.
 */
const WEAK_BASES = [
	'password',
	'passw0rd',
	'haslo',
	'hasło',
	'qwerty',
	'123456',
	'iloveyou',
	'admin',
	'letmein',
	'welcome',
	'monkey',
	'dragon',
	'abc123',
	'zaq12wsx',
	'hivewise',
	'pasieka',
	'pszczoly',
	'pszczoły',
];

/**
 * The rules for a password being *set* — registration and password reset both
 * write to the same `passwordHash` column, so they must agree. `signInSchema`
 * deliberately does not use this: an existing password predating a rule change
 * still has to be accepted.
 */
const newPassword = z.string().superRefine((value, ctx) => {
	for (const requirement of PASSWORD_REQUIREMENTS) {
		if (!requirement.test(value)) {
			ctx.addIssue({ code: 'custom', message: requirement.message });
		}
	}

	if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) {
		ctx.addIssue({ code: 'custom', message: 'Hasło jest za długie' });
	}

	const lowered = value.toLowerCase();

	if (WEAK_BASES.some((base) => lowered.includes(base))) {
		ctx.addIssue({ code: 'custom', message: 'Hasło zawiera zbyt popularne słowo — wybierz inne' });
	}
});

const confirmedPassword = { password: newPassword, confirmPassword: z.string() };

const passwordsMatch = (values: { password: string; confirmPassword: string }) =>
	values.password === values.confirmPassword;

const passwordMismatch = {
	message: 'Hasła nie są identyczne',
	// Attaches the error to the second field, which is the one the user can fix
	// without retyping both.
	path: ['confirmPassword'],
};

export const registerSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, 'Imię musi mieć co najmniej 2 znaki')
			.max(100, 'Imię może mieć maksymalnie 100 znaków'),
		email,
		...confirmedPassword,
	})
	.refine(passwordsMatch, passwordMismatch);

export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/** What the form binds to. The token rides in a prop, not in a field. */
export const resetPasswordSchema = z.object(confirmedPassword).refine(passwordsMatch, passwordMismatch);

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/** What the route handler parses: the same rules plus the token off the link. */
export const resetPasswordRequestSchema = z
	.object({
		token: z.string().min(1, 'Brak tokenu resetowania hasła'),
		...confirmedPassword,
	})
	.refine(passwordsMatch, passwordMismatch);

/**
 * Changing a password from inside the account, which the reset flow is not:
 * there is no emailed proof here, so the current password is the proof, and it
 * is checked for presence only for the same reason `signInSchema` is — an
 * existing password predating a rule change still has to be typeable.
 *
 * `newPassword` is the same `confirmedPassword` pair the reset uses, so the two
 * ways of setting a password cannot disagree about what a good one is.
 */
export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Podaj aktualne hasło'),
		...confirmedPassword,
	})
	.refine(passwordsMatch, passwordMismatch)
	.refine((values) => values.currentPassword !== values.password, {
		message: 'Nowe hasło musi różnić się od aktualnego',
		path: ['password'],
	});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * The typed phrase behind account deletion. Only presence is validated here —
 * whether it *matches* is `isDeleteConfirmed`'s job in `profile.ts`, so the
 * literal lives in one place rather than being duplicated into a Zod literal.
 */
export const deleteAccountSchema = z.object({
	confirmation: z.string().min(1, 'Wpisz frazę potwierdzającą'),
});

export type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;
