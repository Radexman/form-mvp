# Rate Limiting & Storage Security Spec — Hivewise

## Scope

Implement rate limiting on all auth server actions and the PDF generation
endpoint using Upstash Redis. Secure Cloudflare R2 storage so PDF files
are never publicly accessible without a signed URL. This spec covers the
full security surface for auth, PDF generation, and file storage.

---

## Install dependencies

```bash
npm install @upstash/ratelimit @upstash/redis
```

---

## Environment variables

Add to `.env`:

```env
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
```

Get these from upstash.com → create a Redis database → REST API tab.
Add both variables to Vercel environment variables as well.

---

## File structure to create

```
lib/
├── ratelimit.ts                    ← limiter instances
└── ratelimit-helpers.ts            ← getIp(), checkLimit(), response helpers
```

---

## Ratelimit configuration (`lib/ratelimit.ts`)

Define one limiter per threat surface. Use `slidingWindow` — it prevents
burst attacks at window boundaries unlike fixed window.

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Login: 5 attempts per minute per IP
// Stops brute force and credential stuffing
export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'rl:login',
  analytics: true,
})

// Register: 3 attempts per 10 minutes per IP
// Prevents mass account creation / enumeration
export const registerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'rl:register',
  analytics: true,
})

// Resend verification email: 3 per 10 minutes per IP
// Prevents using Hivewise as a spam relay
export const resendVerificationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'rl:resend-verify',
  analytics: true,
})

// Password reset request: 3 per 10 minutes per IP
export const passwordResetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix: 'rl:password-reset',
  analytics: true,
})

// PDF generation: 20 per hour per userId (not IP)
// Keyed by userId because Free/Premium limits are per account.
// Prevents bill bombing on Render microservice and R2 storage.
export const pdfLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'rl:pdf',
  analytics: true,
})
```

---

## Helper utilities (`lib/ratelimit-helpers.ts`)

```ts
import { headers } from 'next/headers'
import { Ratelimit } from '@upstash/ratelimit'

// Extract real IP — Vercel sets x-forwarded-for, take the first entry only
export function getIp(): string {
  const forwarded = headers().get('x-forwarded-for')
  const ip = forwarded?.split(',')[0].trim()
  return ip ?? 'anonymous'
}

// Standard rate limit check for server actions
// Returns an error string if limited, null if ok
export async function checkRateLimit(
  limiter: Ratelimit,
  key: string
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const { success, reset } = await limiter.limit(key)
  if (!success) {
    const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000)
    return { limited: true, retryAfterSeconds }
  }
  return { limited: false, retryAfterSeconds: 0 }
}
```

---

## Auth server actions — rate limiting

Apply rate limiting as the **first thing** inside every auth server action,
before any database call or password hashing. Failing fast is important —
you don't want to run bcrypt 1000 times per second during an attack.

### Login action

```ts
'use server'

import { loginLimiter } from '@/lib/ratelimit'
import { checkRateLimit, getIp } from '@/lib/ratelimit-helpers'

export async function loginAction(formData: FormData) {
  // ── rate limit ────────────────────────────────────────────────────────────
  const ip = getIp()
  const { limited, retryAfterSeconds } = await checkRateLimit(loginLimiter, ip)

  if (limited) {
    return {
      error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${retryAfterSeconds} sekund.`,
    }
  }

  // ── rest of login logic ───────────────────────────────────────────────────
  // ...verify credentials, create session, redirect
}
```

### Register action

```ts
'use server'

import { registerLimiter } from '@/lib/ratelimit'
import { checkRateLimit, getIp } from '@/lib/ratelimit-helpers'

export async function registerAction(formData: FormData) {
  const ip = getIp()
  const { limited, retryAfterSeconds } = await checkRateLimit(registerLimiter, ip)

  if (limited) {
    return {
      error: `Zbyt wiele rejestracji z tego adresu IP. Spróbuj za ${retryAfterSeconds} sekund.`,
    }
  }

  // ...create user, send verification email
}
```

### Resend verification email action

```ts
'use server'

import { resendVerificationLimiter } from '@/lib/ratelimit'
import { checkRateLimit, getIp } from '@/lib/ratelimit-helpers'

export async function resendVerificationAction(email: string) {
  const ip = getIp()
  const { limited, retryAfterSeconds } = await checkRateLimit(
    resendVerificationLimiter,
    ip
  )

  if (limited) {
    return {
      error: `Możesz poprosić o nowy link za ${retryAfterSeconds} sekund.`,
    }
  }

  // ...generate new token, send email
}
```

### Password reset action

```ts
'use server'

import { passwordResetLimiter } from '@/lib/ratelimit'
import { checkRateLimit, getIp } from '@/lib/ratelimit-helpers'

export async function requestPasswordResetAction(email: string) {
  const ip = getIp()
  const { limited, retryAfterSeconds } = await checkRateLimit(
    passwordResetLimiter,
    ip
  )

  if (limited) {
    return {
      error: `Spróbuj ponownie za ${retryAfterSeconds} sekund.`,
    }
  }

  // IMPORTANT: always return the same response whether the email exists or not.
  // Returning "email not found" leaks account existence information.
  // Always respond: "Jeśli konto istnieje, wyślemy link resetujący."
}
```

---

## PDF generation — rate limiting

PDF generation is keyed by `userId`, not IP, because:
- Users on mobile networks change IP frequently
- The threat here is per-account quota abuse, not anonymous attacks
- It maps directly to the `UsagePeriod.pdfGenerationsUsed` business logic

Rate limiting and quota checks are separate layers:
- **Rate limiter (Redis)** — fast, runs before any DB call, stops burst abuse
- **Quota check (Prisma)** — enforces Free/Premium business rules

```ts
'use server'

import { auth } from '@/lib/auth'
import { pdfLimiter } from '@/lib/ratelimit'
import { checkRateLimit } from '@/lib/ratelimit-helpers'
import { prisma } from '@/lib/prisma'

export async function generatePdfAction(inspectionId: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'Musisz być zalogowany.' }
  }

  // ── rate limit (Redis, fast) ──────────────────────────────────────────────
  const { limited, retryAfterSeconds } = await checkRateLimit(
    pdfLimiter,
    session.user.id   // keyed by userId, not IP
  )

  if (limited) {
    return {
      error: `Przekroczono limit generowania PDF. Spróbuj za ${retryAfterSeconds} sekund.`,
    }
  }

  // ── quota check (Prisma, business logic) ──────────────────────────────────
  const periodStart = new Date(Date.UTC(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ))

  const [period, subscription] = await Promise.all([
    prisma.usagePeriod.findUnique({
      where: { userId_periodStart: { userId: session.user.id, periodStart } },
    }),
    prisma.subscription.findUnique({
      where: { userId: session.user.id },
      select: { tier: true },
    }),
  ])

  const pdfLimit = subscription?.tier === 'PREMIUM' ? 100 : 20
  const used = period?.pdfGenerationsUsed ?? 0

  if (used >= pdfLimit) {
    return {
      error: subscription?.tier === 'PREMIUM'
        ? 'Osiągnąłeś miesięczny limit 100 PDF dla planu Premium.'
        : 'Osiągnąłeś miesięczny limit 20 PDF dla planu Free. Przejdź na Premium.',
      upgradeRequired: subscription?.tier !== 'PREMIUM',
    }
  }

  // ── generate PDF + upload to R2 ───────────────────────────────────────────
  // (see R2 security section below for signed URL pattern)

  // ── increment usage counter ───────────────────────────────────────────────
  await prisma.usagePeriod.upsert({
    where: { userId_periodStart: { userId: session.user.id, periodStart } },
    create: { userId: session.user.id, periodStart, pdfGenerationsUsed: 1 },
    update: { pdfGenerationsUsed: { increment: 1 } },
  })
}
```

---

## R2 storage security

This is critical. PDFs contain private inspection data —
queen status, health alerts, hive locations. They must never be
publicly accessible.

### Bucket configuration

In Cloudflare R2 dashboard:

1. Create bucket named `hivewise-inspections`
2. Set access to **Private** — no public access whatsoever
3. Do NOT enable "Allow public access" — leave it off permanently
4. Create an API token with scope:
   - `Object Read & Write` on this bucket only
   - Not account-level — bucket-scoped only

Add to `.env`:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=hivewise-inspections
```

### R2 client (`lib/r2.ts`)

```ts
import { S3Client } from '@aws-sdk/client-s3'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
```

Install:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Upload PDF to R2

Store PDFs under a path that includes `userId` so ownership is
encoded in the key itself:

```ts
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2 } from '@/lib/r2'

export async function uploadPdfToR2(
  pdfBytes: Buffer,
  userId: string,
  inspectionId: string
): Promise<string> {
  // key encodes ownership — userId prefix prevents path traversal
  const key = `users/${userId}/inspections/${inspectionId}.pdf`

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: pdfBytes,
    ContentType: 'application/pdf',
    // prevent browsers from rendering inline — forces download
    ContentDisposition: 'attachment',
    // server-side metadata for auditing
    Metadata: {
      userId,
      inspectionId,
      uploadedAt: new Date().toISOString(),
    },
  }))

  // never return a public URL — return only the key
  // access is always through signed URLs generated on demand
  return key
}
```

Store the returned `key` in `PdfGenerationJob.fileUrl` (despite the
column name, store the key, not a URL — the URL is generated per request).

### Serving PDFs — signed URLs only

Never serve a static R2 URL. Always generate a short-lived signed URL
server-side after verifying ownership:

```ts
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2 } from '@/lib/r2'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getPdfSignedUrl(inspectionId: string): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  // ── ownership check — CRITICAL ────────────────────────────────────────────
  // Verify the inspection belongs to the requesting user.
  // Without this check, any logged-in user could request any PDF by ID.
  const job = await prisma.pdfGenerationJob.findFirst({
    where: {
      inspectionId,
      inspection: {
        userId: session.user.id,   // ownership enforced here
      },
      status: 'SUCCEEDED',
    },
    select: { fileUrl: true },
  })

  if (!job?.fileUrl) throw new Error('PDF not found')

  // ── generate signed URL — expires in 15 minutes ───────────────────────────
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: job.fileUrl,              // the stored key, not a public URL
  })

  const signedUrl = await getSignedUrl(r2, command, {
    expiresIn: 60 * 15,           // 15 minutes — enough to download, not to share
  })

  return signedUrl
}
```

### Why signed URLs with 15 minute expiry

A permanent URL shared in a group chat or screenshot gives anyone
permanent access to private inspection data. A 15-minute signed URL
expires before it can be meaningfully shared. If the user needs the PDF
again they request a new signed URL — one server-side ownership check,
fresh URL, done.

---

## File key naming — path traversal prevention

Always construct R2 keys server-side from trusted values only.
Never interpolate user-supplied strings directly into the key.

```ts
// CORRECT — key built from validated server-side values only
const key = `users/${userId}/inspections/${inspectionId}.pdf`

// WRONG — never do this
const key = `users/${userInput}/inspections/${anotherUserInput}.pdf`
```

Both `userId` and `inspectionId` come from the database after an
ownership check, never from request parameters directly.

---

## Security summary

| Threat                        | Mitigation                                          |
|-------------------------------|-----------------------------------------------------|
| Brute force login             | `loginLimiter` — 5 req/min per IP                  |
| Credential stuffing           | `loginLimiter` — same, makes automation unfeasible  |
| Mass account creation         | `registerLimiter` — 3 req/10min per IP             |
| Email spam relay abuse        | `resendVerificationLimiter` — 3 req/10min per IP   |
| PDF bill bombing (Render/R2)  | `pdfLimiter` — 20 req/h per userId                 |
| Monthly quota abuse           | `UsagePeriod` Prisma check after rate limit         |
| Public PDF access             | Private R2 bucket — no public access ever           |
| Stolen PDF URL sharing        | Signed URLs expire in 15 minutes                    |
| Cross-user PDF access (IDOR)  | Ownership check before signed URL generation        |
| Path traversal in R2 keys     | Keys built from server-side DB values only          |
| Account-level R2 key exposure | Bucket-scoped API token — not account-level         |

---

## Acceptance criteria

- [ ] `@upstash/ratelimit` and `@upstash/redis` installed
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env` and Vercel
- [ ] Login returns Polish error message after 5 failed attempts in 1 minute
- [ ] Register returns error after 3 attempts in 10 minutes from same IP
- [ ] Resend verification returns error after 3 attempts in 10 minutes
- [ ] PDF generation rate limited to 20 per hour per userId
- [ ] PDF quota enforced separately via Prisma `UsagePeriod`
- [ ] R2 bucket is private — no public access enabled
- [ ] PDFs stored under `users/{userId}/inspections/{inspectionId}.pdf`
- [ ] PDF access only via signed URL with 15-minute expiry
- [ ] Signed URL endpoint verifies ownership before generating URL
- [ ] No public R2 URL stored or returned anywhere in the codebase
- [ ] R2 API token is bucket-scoped, not account-level
- [ ] All env variables in `.env` — no credentials hardcoded

---

## What this spec does NOT cover

- DDoS protection at network level (use Cloudflare proxy for that)
- Rate limiting on analytics endpoints (low risk, add later)
- R2 bucket versioning / deletion protection (consider for production)
- Audit logging of PDF access (consider for GDPR compliance later)
- IP allowlisting for the PDF microservice on Render
