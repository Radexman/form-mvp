import { auth } from '@/auth';
import { pdfLimiter } from '@/app/lib/ratelimit';
import { checkRateLimit, formatRetryAfter, rateLimitedResponse } from '@/app/lib/ratelimit-helpers';

// Same-origin proxy to the PDF microservice. The browser calls this route, and the
// server forwards to the external service — sidestepping CORS entirely and keeping
// the service URL off the client. Configured via PDF_SERVICE_URL (see .env.example).
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;

export async function POST(request: Request) {
	/**
	 * Until now this route was public — `proxy.ts` deliberately left it out of its
	 * matcher — which meant anyone who knew the path could bill our Render service
	 * without an account. Every real caller reaches it from `/dashboard`, which
	 * already requires a session, so requiring one here costs a legitimate user
	 * nothing and closes an open endpoint.
	 *
	 * It is also the prerequisite for the limiter below: without a session there
	 * is no `userId` to key on.
	 */
	const session = await auth();

	if (!session?.user?.id) {
		return Response.json({ error: 'Musisz być zalogowany, aby wygenerować PDF.' }, { status: 401 });
	}

	/**
	 * Keyed by user, not IP — see `pdfLimiter`. This is the burst guard on the
	 * Render bill, and it runs before the upstream call so a runaway client is
	 * refused here rather than forwarded.
	 *
	 * It is not the monthly Free/Premium quota. That is a separate `UsagePeriod`
	 * check that belongs next to persisted inspections, which this app does not
	 * write yet.
	 */
	const { limited, retryAfterSeconds } = await checkRateLimit(pdfLimiter, session.user.id);

	if (limited) {
		return rateLimitedResponse(
			`Przekroczono limit generowania PDF. Spróbuj ponownie za ${formatRetryAfter(retryAfterSeconds)}.`,
			retryAfterSeconds,
		);
	}

	if (!PDF_SERVICE_URL) {
		console.error('PDF_SERVICE_URL is not set');
		return new Response('PDF service is not configured', { status: 500 });
	}

	const body = await request.text();

	const upstream = await fetch(PDF_SERVICE_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	});

	if (!upstream.ok) {
		const message = await upstream.text();
		return new Response(message || 'PDF generation failed', { status: upstream.status });
	}

	const headers = new Headers();
	headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/pdf');
	const disposition = upstream.headers.get('content-disposition');
	if (disposition) headers.set('Content-Disposition', disposition);

	return new Response(upstream.body, { status: 200, headers });
}
