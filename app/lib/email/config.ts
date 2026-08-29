/**
 * The one place `EMAIL_VERIFICATION_ENABLED` is read. Nothing else in the app
 * touches the raw variable, so there is a single answer to "is verification on"
 * and a single place to change how that answer is computed.
 *
 * Server-only, deliberately without a `NEXT_PUBLIC_` prefix — same reasoning as
 * `APP_URL`. The register form is a client component and cannot read this; it
 * learns the outcome from the `verificationRequired` field the register route
 * puts in its 201 body.
 *
 * The `env` parameter mirrors `resolveAppUrl` in `verification-token.ts`; it is
 * what makes the parsing unit-testable without mutating `process.env`.
 */

// Accepted spellings of "on". `yes` and `on` are honoured alongside the
// canonical `true` because unset means *disabled* — someone who writes
// `=yes` intending to enable verification would otherwise silently get it
// switched off, which is the expensive direction to guess wrong in.
const TRUTHY = new Set(['true', '1', 'yes', 'on']);

/**
 * Off unless explicitly switched on. That is the state this project ships in
 * today: `onboarding@resend.dev` is Resend's sandbox sender and only delivers
 * to the account that owns the API key, so until a domain is verified at
 * resend.com/domains an enabled-by-default flag would strand every registration
 * but one.
 *
 * The cost of that default is real and worth knowing: forgetting the variable
 * in a deployment ships verification *disabled* rather than failing loudly.
 * Revisit the direction once a sender domain exists.
 */
export function isEmailVerificationEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return TRUTHY.has((env.EMAIL_VERIFICATION_ENABLED ?? '').trim().toLowerCase());
}
