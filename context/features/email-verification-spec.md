# Email Verification Spec — Resend

## Base prompt

> Setup email verification on register. Users need to click on the link in
> their email. We are using Resend. The RESEND_API_KEY is in the .env file.
> Use onboarding@resend.dev as the from email for now.

---

## Scope

Add email verification to the registration flow. After a user registers,
they receive a verification email via Resend. The account is created
immediately but marked as unverified. Access to `/dashboard` is blocked
until the email is verified. Clicking the link in the email marks the
account as verified and redirects to `/dashboard`.

---

## Prerequisites

- `RESEND_API_KEY` is set in `.env`
- Auth.js is configured and registration works
- Prisma schema is accessible at `../generated/prisma`
- `resend` npm package is not yet installed

---

## Install dependency

```bash
npm install resend
```

---

## Schema changes

Add two fields to the `User` model in `prisma/schema.prisma`:

```prisma
model User {
  // ... existing fields ...

  emailVerified     Boolean   @default(false)
  verificationToken String?   @unique
}
```

After editing the schema run:

```bash
npx prisma migrate dev --name add_email_verification
```

---

## Environment variables

`RESEND_API_KEY` is already in `.env`. Add one more:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

This is used to build the verification link. On Vercel set it to the
production URL.

---

## File structure to create

```
lib/
├── resend.ts              ← Resend client singleton
└── email/
    └── sendVerificationEmail.ts

app/
└── api/
    └── auth/
        └── verify-email/
            └── route.ts   ← GET handler, consumes the token
```

---

## Resend client (`lib/resend.ts`)

```ts
import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)
```

---

## Send verification email (`lib/email/sendVerificationEmail.ts`)

```ts
import { resend } from '@/lib/resend'
import crypto from 'crypto'

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verificationUrl =
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${token}`

  await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: email,
    subject: 'Potwierdź swój adres email — Hivewise',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #111827;">
        <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #111827;">
          Witaj w Hivewise 🐝
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin-bottom: 24px;">
          Kliknij przycisk poniżej, aby potwierdzić swój adres email i aktywować konto.
        </p>
        <a
          href="${verificationUrl}"
          style="
            display: inline-block;
            background: #4ade80;
            color: #0d0f0d;
            font-weight: 700;
            font-size: 14px;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
          "
        >
          Potwierdź email
        </a>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
          Jeśli nie zakładałeś konta w Hivewise, możesz zignorować tę wiadomość.
          Link wygasa po 24 godzinach.
        </p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
          Lub skopiuj poniższy link do przeglądarki:<br/>
          <span style="color: #6b7280;">${verificationUrl}</span>
        </p>
      </div>
    `,
  })
}
```

---

## Registration flow changes

In the existing registration handler (server action or API route),
add token generation and email sending after the user is created:

```ts
import { generateVerificationToken, sendVerificationEmail } from '@/lib/email/sendVerificationEmail'
import { prisma } from '@/lib/prisma'

// inside register handler, after prisma.user.create():
const token = generateVerificationToken()

await prisma.user.update({
  where: { id: newUser.id },
  data: { verificationToken: token },
})

await sendVerificationEmail(email, token)
```

The user is created with `emailVerified: false` (Prisma default).
Do **not** sign the user in automatically after registration.
Instead redirect to `/register/check-email` with a simple message:

```
"Wysłaliśmy link aktywacyjny na adres [email].
 Sprawdź swoją skrzynkę i kliknij w link, aby aktywować konto."
```

---

## Verification route (`app/api/auth/verify-email/route.ts`)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url))
  }

  const user = await prisma.user.findUnique({
    where: { verificationToken: token },
  })

  if (!user) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url))
  }

  if (user.emailVerified) {
    // already verified — just redirect to login
    return NextResponse.redirect(new URL('/login?verified=already', req.url))
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,   // consume the token — one-time use
    },
  })

  return NextResponse.redirect(new URL('/login?verified=true', req.url))
}
```

---

## Auth guard update

In `app/(dashboard)/layout.tsx`, extend the existing guard to block
unverified users:

```ts
const session = await auth()
if (!session?.user) redirect('/login')

// fetch verification status
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { emailVerified: true },
})

if (!user?.emailVerified) redirect('/verify-email-prompt')
```

Create `app/verify-email-prompt/page.tsx` — a simple static page:

```
"Twoje konto czeka na weryfikację.
 Sprawdź skrzynkę email i kliknij w link aktywacyjny.
 [Wyślij ponownie]"
```

The "Wyślij ponownie" button triggers a server action that calls
`sendVerificationEmail` again with a freshly generated token.

---

## Login page: verification feedback

On `/login`, read the `verified` query param and show a toast or
inline message:

| `?verified=true`    | "Email potwierdzony. Możesz się teraz zalogować." |
| `?verified=already` | "Ten link był już użyty. Zaloguj się."            |
| `?error=invalid_token` | "Link jest nieprawidłowy lub wygasł."          |

---

## Demo user exception

The seeded demo user (`demo@hivewise.app`) must have `emailVerified: true`
in the seed script so it can access `/dashboard` without going through the
email flow. Update `prisma/seed.ts`:

```ts
await prisma.user.create({
  data: {
    email: 'demo@hivewise.app',
    name: 'Jan Pszczelarz',
    passwordHash: await bcrypt.hash('demo1234', 10),
    emailVerified: true,   // ← add this
  },
})
```

If the seed has already been run, update the existing user directly in
Neon Console:

```sql
UPDATE "User"
SET "emailVerified" = true
WHERE email = 'demo@hivewise.app';
```

---

## Acceptance criteria

- [ ] `resend` package installed
- [ ] Migration applied — `User` has `emailVerified` and `verificationToken` columns
- [ ] Registering a new account sends a verification email via Resend
- [ ] Email arrives from `onboarding@resend.dev` with subject containing "Hivewise"
- [ ] Clicking the link sets `emailVerified = true` and nulls the token
- [ ] Clicking the link redirects to `/login?verified=true`
- [ ] Unverified user hitting `/dashboard` is redirected to `/verify-email-prompt`
- [ ] Demo user (`demo@hivewise.app`) has `emailVerified = true` and can log in directly
- [ ] Token is single-use — clicking the link a second time redirects to `/login?verified=already`
- [ ] Invalid or missing token redirects to `/login?error=invalid_token`
- [ ] No `RESEND_API_KEY` hardcoded anywhere — only read from `process.env`

---

## What this spec does NOT cover

- Token expiry enforcement (24h window mentioned in email copy but not
  checked server-side — add in a follow-up if needed)
- Email change / re-verification flow
- OAuth providers (Google, GitHub) — those are pre-verified by the provider
- Rate limiting on the resend action
