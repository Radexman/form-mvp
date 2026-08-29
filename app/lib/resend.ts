import { Resend } from 'resend';

let client: Resend | undefined;

/**
 * Built on first send, not at import: `next build` imports every route module,
 * and the API key is a runtime secret that need not exist at build time. The
 * constructor never validates the key, so an unset one would otherwise surface
 * as an opaque 401 from Resend rather than as this message.
 */
export function getResend(): Resend {
	if (!client) {
		const apiKey = process.env.RESEND_API_KEY;

		if (!apiKey) {
			throw new Error('RESEND_API_KEY is not set. Copy .env.example to .env.local and fill it in.');
		}

		client = new Resend(apiKey);
	}

	return client;
}
