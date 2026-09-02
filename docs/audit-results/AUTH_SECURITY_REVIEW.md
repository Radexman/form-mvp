# Auth Security Review

**Last audited:** 2026-09-02
**Scope:** `auth.ts`, `auth.config.ts`, `proxy.ts`, `next.config.ts`, `app/api/auth/{register,verify-email,forgot-password,reset-password}/route.ts`, `app/api/account/{change-password,delete}/route.ts`, `app/lib/auth.schema.ts`, `app/lib/auth-actions.ts`, `app/lib/callback-url.ts`, `app/lib/profile.ts`, `app/lib/email/*`, `app/(auth)/**`, `app/(dashboard)/{layout,profile/page}.tsx`, `app/components/{auth,profile}/*`, `prisma/schema.prisma`, `.env.example`
**Auditor:** auth-auditor agent

## Summary

This is a well-defended implementation. Token generation, expiry, single-use enforcement,
session validation, and query scoping are all done correctly, and several sharp edges
(OAuth-only accounts, JWT outliving its user row, double-submit races, open redirect) are
handled deliberately rather than by accident. **No Critical or High findings.**

What is missing is the perimeter rather than the logic: there is no rate limiting anywhere in
the app, and two endpoints leak account existence through response *timing* despite returning
deliberately uniform bodies. The remaining items are hardening.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 4 |
| Low | 3 |

## Findings

### [MEDIUM] No rate limiting on any authentication endpoint

**Location:** `auth.ts:50` (`authorize`), `app/api/auth/register/route.ts:26`, `app/api/auth/forgot-password/route.ts:16`, `app/api/auth/reset-password/route.ts:23`, `app/lib/email/verification-actions.ts:70`

**What's wrong:** `package.json` carries no rate-limiting dependency, and a search across
`app/`, `auth.ts` and `auth.config.ts` finds no limiter, no attempt counter, and no lockout.
NextAuth does not provide one. Every credential-adjacent entry point accepts unlimited
requests from a single source:

- `/api/auth/callback/credentials` → unlimited online password guessing against `authorize`.
- `/api/auth/register` → bulk account creation, and its deliberate 409-on-taken-address
  (documented at `route.ts:59-73`) becomes a fast bulk enumeration oracle at scale rather than
  the one-off disclosure the comment weighs up.
- `/api/auth/forgot-password` and `resendVerificationForEmailAction` → unlimited mail to any
  registered address, at the app's Resend reputation and quota.

There is a second cost: `bcrypt.compare` at cost 10 is deliberately expensive, so an
unauthenticated flood of sign-in attempts is also a CPU exhaustion vector against the
serverless function.

The strong password policy (`app/lib/auth.schema.ts:52-96` — 12 chars, mixed case, digit,
weak-base blocklist) makes blind brute force impractical, which is why this is Medium and not
High. It does not help against credential stuffing, where each guess is a password already
known to be real.

**Exploit:** attacker has a list of 10k leaked `email:password` pairs → POSTs each to
`/api/auth/callback/credentials` with no throttle → every pair reused on this site
authenticates, and nothing logs, slows, or blocks the run.

**Fix:** a shared, IP-plus-identifier limiter in front of the credential endpoints. On
serverless the counter must be external (Upstash Redis, or Postgres if you would rather not
add infrastructure) — an in-process `Map` resets on every cold start and is not shared between
concurrent lambdas.

```ts
// app/lib/rate-limit.ts
import { prisma } from '@/app/lib/prisma';

/**
 * Fixed-window counter in Postgres. Not the tightest algorithm, but it is shared
 * across lambdas, which an in-process Map is not.
 */
export async function tooManyAttempts(key: string, limit: number, windowMs: number): Promise<boolean> {
	const since = new Date(Date.now() - windowMs);
	const attempts = await prisma.authAttempt.count({ where: { key, createdAt: { gte: since } } });

	if (attempts >= limit) {
		return true;
	}

	await prisma.authAttempt.create({ data: { key } });

	return false;
}
```

Then, in `auth.ts`'s `authorize`, before the bcrypt compare:

```ts
const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

if (await tooManyAttempts(`signin:${ip}:${email}`, 5, 15 * 60 * 1000)) {
	return null;
}
```

Suggested budgets: sign-in 5 per 15 min per IP+email; register 3/hour per IP; forgot-password
and resend 3/hour per address **and** per IP. Returning `null` from `authorize` keeps the
existing "no reason disclosed" property intact. A scheduled delete of rows older than the
longest window keeps the table from growing without bound.

---

### [MEDIUM] Forgot-password leaks account existence through response timing

**Location:** `app/api/auth/forgot-password/route.ts:47-56`

**What's wrong:** The endpoint is carefully written to return an identical `200 { ok: true }`
for every address (`route.ts:7-15` explains exactly why). But the send is **awaited** inside
the `if (user)` branch before that response is returned. A registered address therefore pays
for a two-statement `$transaction` plus a full round trip to the Resend API; an unregistered
one pays for a single indexed `findUnique` and returns immediately. That difference is
hundreds of milliseconds — far above measurement noise, and stable enough to script.

The uniform body is doing exactly what it was written to do; the timing channel simply routes
around it.

`resendVerificationForEmailAction` (`app/lib/email/verification-actions.ts:82-89`) has the
identical shape and additionally narrows the signal — a slow response there means the address
exists **and** is unverified **and** has a password, which is a more precise oracle than the
forgot-password one.

**Exploit:** attacker has a list of candidate addresses → POSTs each to
`/api/auth/forgot-password` and records elapsed time → responses above ~200 ms are registered
accounts, below are not. Combined with the missing rate limit above, the whole list is
enumerated in one unthrottled pass.

**Fix:** stop awaiting the send on the request path. `after()` runs the callback once the
response has been flushed, so both branches return in the same time.

```ts
import { after } from 'next/server';

// ...
if (user) {
	// Not awaited: awaiting it makes "this address exists" measurable, which is
	// the whole thing the uniform 200 below is protecting.
	after(async () => {
		try {
			await issuePasswordResetEmail(email);
		} catch (error) {
			console.error('[forgot-password] reset email failed', error);
		}
	});
}

return Response.json({ ok: true });
```

Apply the same change to `resendVerificationForEmailAction`. Note that this makes the `FAILED`
return there unreachable, so that action should return `SENT` unconditionally after scheduling
— which is effectively what it already does for the non-existent-user case.

---

### [MEDIUM] A password change or reset does not invalidate existing sessions

**Location:** `app/api/account/change-password/route.ts:81-98`, `app/api/auth/reset-password/route.ts:72-89`, `auth.ts:121-127`

**What's wrong:** Sessions are JWTs (`auth.ts:24`), so nothing server-side is consulted when a
cookie is presented. Both password-write paths update `passwordHash` and clear outstanding
reset tokens, but neither has any way to reject a token minted before the change — and the
`jwt` callback does no lookup that could.

The change-password route is the sharp case. Someone who changes their password *because they
believe it is compromised* — which is the main reason anyone uses that form — has not evicted
the attacker. The attacker's existing cookie keeps working until the JWT expires, which at the
Auth.js default is 30 days. The route already reasons about revocation for reset links
(`route.ts:86-98`) but not for sessions.

This is a known trade-off of `strategy: 'jwt'`, and `app/api/account/delete/route.ts:11-14`
shows the codebase is aware of it in general. It is reported here because a standard,
straightforward mechanism is available and neither write path uses it.

**Exploit:** attacker has the victim's password (leak, shoulder-surf) and signs in, obtaining a
JWT cookie → the victim notices and changes their password → the attacker's cookie is still
accepted on every route for up to 30 days, including `/api/account/delete`.

**Fix:** stamp the user row when a password is written, put the stamp in the token at sign-in,
and reject tokens older than the stamp. The `jwt` callback's return type is
`Awaitable<JWT | null>` (`node_modules/@auth/core/index.d.ts:331`), so returning `null` is the
supported way to invalidate.

```prisma
// prisma/schema.prisma, on User
passwordChangedAt DateTime?
```

```ts
// auth.ts — replaces the current jwt callback
async jwt({ token, user }) {
	if (user?.id) {
		token.id = user.id;
		token.pwdAt = Date.now();

		return token;
	}

	// Costs one indexed lookup per authenticated request. `proxy.ts` builds its
	// instance from auth.config.ts and never runs this, so the Proxy hop stays
	// database-free and optimistic exactly as documented there.
	const row = await prisma.user.findUnique({
		where: { id: token.id as string },
		select: { passwordChangedAt: true },
	});

	if (row?.passwordChangedAt && (token.pwdAt as number) < row.passwordChangedAt.getTime()) {
		return null;
	}

	return token;
}
```

Then add `passwordChangedAt: new Date()` to the `data` of both `change-password/route.ts:81-84`
and the `user.update` inside the reset transaction.

If the extra per-request query is not acceptable, the cheaper partial mitigation is to bound
the window instead — `session: { strategy: 'jwt', maxAge: 24 * 60 * 60 }` in `auth.ts`.

---

### [MEDIUM] Google account linking trusts an `email_verified` claim it never reads

**Location:** `auth.config.ts:22-31`

**What's wrong:** `allowDangerousEmailAccountLinking: true` is justified in the comment on the
grounds that "Google verifies every email it returns". Auth.js does not check that. In
`packages/core/src/lib/actions/callback/handle-login.ts`, the flag causes the existing user to
be adopted purely on an email match:

```ts
if (provider?.allowDangerousEmailAccountLinking) {
  user = userByEmail
  isNewUser = false
}
```

No `email_verified` inspection happens anywhere on that path. Auth.js's own Google provider
docs treat `profile.email_verified` as something the application must check in a `signIn`
callback, and its security notes state plainly that automatic linking is only safe when the
provider is trusted to have verified the address — the trust is transferred to you, not
enforced for you.

Google does return `email_verified`, and it is not always `true` (accounts registered against a
non-Gmail address, and some Workspace configurations). The application currently has no way to
tell the difference.

**Exploit:** attacker obtains a Google profile whose `email` equals a victim's registered
address but whose `email_verified` is `false` → clicks "Sign in with Google" → Auth.js links to
the victim's existing credentials account and issues a session → full takeover, and the
`linkAccount` event at `auth.ts:95-108` then stamps the account verified and drops the victim's
pending token.

Obtaining such a profile is the hard step and is not straightforward for a `@gmail.com` victim,
which is why this is Medium rather than High. The check costs three lines and is what the
flag's own documentation asks for.

**Fix:** add a `signIn` callback in `auth.ts` alongside the existing ones.

```ts
/**
 * `allowDangerousEmailAccountLinking` links on an email match alone — Auth.js
 * does not look at `email_verified`. This is the check that makes the flag's
 * premise ("Google verifies every email it returns") actually hold.
 */
signIn({ account, profile }) {
	if (account?.provider === 'google') {
		return profile?.email_verified === true;
	}

	return true;
},
```

---

### [LOW] The sign-in password is passed as a server-action argument and printed in the dev terminal

**Location:** `app/lib/auth-actions.ts:19-33`, `next.config.ts:3-18`

**What's wrong:** Next.js logs Server Function invocations — name, **arguments**, and duration —
to the terminal by default in development, controlled by `logging.serverFunctions`.
`next.config.ts` does not set it, so the default applies. `signInAction(values, callbackUrl)`
takes `{ email, password }` as its first argument, so every development sign-in prints the
user's password in cleartext to the terminal and into any scrollback, tmux buffer, or CI log
that captures it.

The codebase already knows this — `app/api/auth/reset-password/route.ts:10-15` and
`app/api/account/change-password/route.ts:9-16` both cite it as the reason those two flows are
route handlers rather than actions. Sign-in is the one credential path that was not moved.

Development-only, and the exposure is the developer's own password on their own machine, which
is why this is Low rather than Medium.

**Exploit:** developer signs in on a shared or recorded dev session (screen share, asciinema, CI
job running `next dev`) → the plaintext password is in the captured output.

**Fix:** the one-line version, which also covers any future action:

```ts
// next.config.ts
const nextConfig: NextConfig = {
	// Server Function arguments are logged by default in dev, and `signInAction`
	// takes a password — see app/lib/auth-actions.ts.
	logging: { serverFunctions: false },
	// ...
};
```

The thorough version is to finish the migration the other two flows started and move sign-in to
a route handler that posts to `/api/auth/callback/credentials`, keeping the password out of the
action boundary entirely.

---

### [LOW] bcrypt cost factor of 10 meets the OWASP floor but sits below current practice

**Location:** `app/api/auth/register/route.ts:24`, `app/api/auth/reset-password/route.ts:19`, `app/api/account/change-password/route.ts:20`, `prisma/seed.ts:17`, `prisma/create-account.ts:27`

**What's wrong:** All five write paths hash at cost 10, and the constants are commented to stay
in sync — the consistency is right. OWASP's Password Storage Cheat Sheet gives 10 as the
**minimum** for bcrypt, so this is not a violation, but practical guidance for 2026 puts the
working figure at 12, with 13–14 common. Each increment doubles an offline cracking run's cost.

Note the trade-off with the rate-limiting finding: raising the cost also raises the CPU price of
each unthrottled sign-in attempt, so land the limiter first or alongside.

**Exploit:** attacker exfiltrates the `User` table via some future unrelated vulnerability →
offline cracking of the stolen hashes runs roughly four times faster at cost 10 than at cost 12.

**Fix:** raise the constant in all five files together. Existing hashes stay at cost 10 until
each user next sets a password — bcrypt encodes the cost in the hash, so `compare` keeps
working. To upgrade in place, re-hash on successful sign-in:

```ts
// auth.ts, inside authorize, after a successful compare
if (bcrypt.getRounds(user.passwordHash) < BCRYPT_ROUNDS) {
	await prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
	});
}
```

---

### [LOW] Schema comment asserts a token invariant the verification route does not uphold

**Location:** `prisma/schema.prisma:26-29` vs `app/api/auth/verify-email/route.ts:36-45`

**What's wrong:** The schema says of `verificationToken` / `verificationTokenExpiresAt`: "Both
are nulled the moment the link is consumed." They are not. The verify route sets `emailVerified`
and deliberately leaves the token on the row, with a comment explaining why (mail scanners
pre-fetch the URL, so a second click must not look forged).

**This is not currently exploitable.** Every consumer of `verificationToken` was traced:
`app/api/auth/verify-email/route.ts:18` is the only reader, and it returns `?verified=already`
before reaching the expiry check whenever `emailVerified` is set. Nothing un-sets
`emailVerified`, so a leftover token cannot verify anything. `auth.ts:100-107` does null both
fields on OAuth linking.

The risk is to the next change, not to today's code: a spent token sits in the database for up
to 24 hours, and a future feature that reads `verificationToken` for any purpose other than this
one route would inherit an invariant the schema promises and the code does not keep.

**Exploit:** none today — recorded as a documentation defect on a security-relevant field.

**Fix:** correct the comment to describe the actual design, so the guarantee a reader relies on
is the one that holds.

```prisma
  // One live token per user, so a re-send overwrites the previous link rather
  // than leaving both working. The token is NOT cleared on consumption — see
  // app/api/auth/verify-email/route.ts; `emailVerified` is what makes a spent
  // token inert, since that route answers "already verified" before it is read.
  verificationToken          String?   @unique
  verificationTokenExpiresAt DateTime?
```

## Passed Checks

Verified by reading the code, not inferred:

**Token generation and lifecycle**

- Both token kinds are 32 bytes of `node:crypto` `randomBytes`, hex-encoded — 256 bits, no `Math.random`, no time or email derivation (`app/lib/email/verification-token.ts:6-8`, `app/lib/email/password-reset-token.ts:15-17`).
- Reset TTL is 1 hour and verification TTL 24 hours, both computed from an injected `now` and unit-tested (`password-reset-token.ts:6`, `verification-token.ts:3`).
- Expiry is enforced at redemption in both flows, and comparisons run in the correct direction (`verify-email/route.ts:32`, `reset-password/route.ts:53`).
- A `null` verification expiry is treated as **expired**, not as "no limit" (`verification-token.ts:14-17`) — the safe direction, and the one that is easy to get backwards.
- Reset tokens are genuinely single-use: the password write and the token delete share one `prisma.$transaction`, so no interleaving leaves a spent token live (`reset-password/route.ts:72-89`).
- `deleteMany` rather than `delete` on redemption, so a double submit cannot throw P2025 on an already-removed row (`reset-password/route.ts:85-88`).
- Issuing a new reset token deletes prior ones for that address in a transaction — exactly one live link per address (`issue-password-reset.ts:15-22`).
- Reset tokens share Auth.js's `VerificationToken` table but are namespaced by a `password-reset:` identifier prefix, and redemption rejects any token whose identifier lacks it — a magic-link token cannot be spent as a reset (`password-reset-token.ts:13`, `reset-password/route.ts:45-51`).
- Both flows write the token to the database *before* mailing it, so a send failure never leaves a live link the database does not know about (`issue-verification.ts:6-9`, `issue-password-reset.ts:6-9`).
- Expired or orphaned reset tokens are cleaned up on the failing request rather than left behind (`reset-password/route.ts:54`, `:65`).

**Password handling**

- Every write path hashes with bcrypt; no path stores or compares plaintext (`register/route.ts:75`, `reset-password/route.ts:70`, `change-password/route.ts:83`).
- Verification is always `bcrypt.compare` (`auth.ts:67`, `change-password/route.ts:72`).
- `passwordHash` never leaves the server: `authorize` returns an explicit field list rather than spreading the row, with a comment saying exactly why (`auth.ts:71-79`), and the profile page selects the column only to derive a boolean (`profile/page.tsx:58-60`, `:89`).
- A `null` `passwordHash` (OAuth-only account) is rejected before it can reach `compare` in sign-in (`auth.ts:60-65`) and is refused with a 409 by change-password, whose comment notes the endpoint stays reachable even though the UI hides the form (`change-password/route.ts:59-70`).
- Change-password requires the current password and checks it server-side (`change-password/route.ts:72`).
- Registration and reset share one `newPassword` schema, so the two ways of setting a password cannot disagree: 12-character minimum, upper and lower case via Unicode property escapes, a digit, and a weak-substring blocklist (`auth.schema.ts:52-120`).
- The 72-byte bcrypt truncation limit is enforced, and measured in **bytes** rather than characters — the correct unit, and one most implementations get wrong (`auth.schema.ts:42`, `:111`).
- `signInSchema` deliberately checks presence only, so a policy change cannot lock out existing users (`auth.schema.ts:26-31`).
- Changing the password deletes outstanding reset links for the address, so a live link in a mailbox cannot set it back (`change-password/route.ts:86-98`).

**Session and authorization**

- Every protected server component and route handler calls `auth()` and handles the null case; nothing reads `session.user.id` unguarded (`(dashboard)/layout.tsx:29-36`, `profile/page.tsx:37-43`, `change-password/route.ts:23-27`, `delete/route.ts:17-20`, `verification-actions.ts:35-39`).
- The "a JWT outlives the row it names" case is handled explicitly in all four places it can occur, rather than crashing on a missing user (`change-password/route.ts:53-57`, `profile/page.tsx:71-75`, `(dashboard)/layout.tsx:44-46`, `(anonymous)/layout.tsx:23-28`).
- Authorization always uses the session id; no route accepts a user id, email, or account reference from the request body or query.
- Every Prisma write is scoped by `session.user.id` in `where` — no cross-user write is reachable.
- No route spreads request JSON into `prisma.user.update({ data })`. Every write names its fields, so `passwordHash`, `emailVerified`, and the subscription tier cannot be set by a caller.
- `proxy.ts` is correctly treated as an optimistic check rather than the boundary, and says so; the real gate is the layout's `auth()` (`proxy.ts:10-15`, `(dashboard)/layout.tsx:31-33`).
- The `emailVerified` gate is enforced server-side in the dashboard layout, not merely in the UI (`(dashboard)/layout.tsx:55-57`).
- Account deletion re-checks the confirmation phrase server-side, case-sensitively, and the comment notes the endpoint is reachable without the dialog (`delete/route.ts:39-49`, `profile.ts:128-130`).
- Deletion also clears both `VerificationToken` namespaces for the address — the one table without a cascade, and therefore the one an outstanding link would survive in (`delete/route.ts:78-100`).

**Disclosure and abuse surface**

- `authorize` returns `null` for every failure and never a reason, so an unknown address, an OAuth-only account, and a wrong password are indistinguishable (`auth.ts:41-49`); `signInAction` keeps the message generic (`auth-actions.ts:38-42`).
- `resendVerificationAction` mails the address on the **session**, never one supplied by the caller, with a comment naming the open-relay risk that avoids (`verification-actions.ts:25-29`).
- Both resend actions re-check `isEmailVerificationEnabled()` and the session themselves rather than trusting their page's redirect, because a server action is reachable by anyone holding its `$ACTION_ID` (`verification-actions.ts:18-23`).
- Open redirect is defended in `safeCallbackUrl`, including the `/\` backslash form that browsers normalise to a host — and it is unit-tested (`callback-url.ts:11-21`).
- Error responses carry fixed Polish strings and Zod field errors only; no stack traces or Prisma internals reach the client.
- Nothing logs a token, password, or secret. The five `console.*` calls in auth code log an error object with a static prefix (`register/route.ts:110`, `forgot-password/route.ts:54`, `verification-actions.ts:57`, `:86`).
- The registration existence check races into the unique index, and P2002 is caught and answered identically rather than surfacing as a 500 (`register/route.ts:123-131`).
- Email is trimmed and lowercased *before* the format check and before the unique lookup, so case variants cannot become two rows (`auth.schema.ts:13-23`).
- The `email` query parameter on `/register/check-email` is rendered through JSX and therefore escaped; no `dangerouslySetInnerHTML` exists anywhere in the auth code.
- `AUTH_SECRET` is documented with a correct generation command, a warning that changing it invalidates live sessions, and an instruction to differ between environments (`.env.example:41-46`).
- `.env.example` holds placeholders only and says so; real values live in `.env.local`.
- `RESEND_API_KEY` is read lazily at first send rather than at import, so `next build` does not require the runtime secret (`resend.ts:5-10`).
- Registration deliberately does not sign the user in, avoiding a JWT minted outside Auth.js's callbacks (`register/route.ts:16-20`).

## Not Audited

- **Handled by NextAuth, out of scope by policy:** CSRF tokens on `/api/auth/*`, session cookie flags and prefixes, JWT signing and encryption, OAuth `state`/PKCE/nonce, and the callback URL allowlist.
- **Client components** were read only for how they call the server (`ChangePasswordForm`, `ResendVerificationButton`, `SignInForm`); their rendering was not reviewed, since every check they perform is re-done server-side.
- **`prisma/seed.ts`, `prisma/create-account.ts`, and `scripts/purge-users.ts`** were not read beyond confirming the bcrypt cost referenced by the route comments. They are developer tooling, but they do write real password hashes and warrant their own pass.
- **Infrastructure:** Neon connection security, Vercel environment variable handling, and Resend domain/SPF/DKIM configuration are outside the code.
- **Dependency CVEs:** no audit of `next-auth@5.0.0-beta.32` or transitive packages was performed. Note that the project pins a **beta** release of NextAuth for its authentication core.
