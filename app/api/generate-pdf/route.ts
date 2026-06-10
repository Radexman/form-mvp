// Same-origin proxy to the PDF microservice. The browser calls this route, and the
// server forwards to the external service — sidestepping CORS entirely and keeping
// the service URL off the client. Configured via PDF_SERVICE_URL (see .env.example).
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL;

export async function POST(request: Request) {
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
