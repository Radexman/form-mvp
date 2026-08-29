import { getResend } from '@/app/lib/resend';

import { buildVerificationUrl, resolveAppUrl } from './verification-token';

const FROM = 'Hivewise <onboarding@resend.dev>';
const SUBJECT = 'Potwierdź swój adres e-mail — Hivewise';

const BACKGROUND = '#0d0f0d';
const BACKDROP_EDGE = '#0a0c0a';
const FOREGROUND = '#e8f0e8';
const MUTED = '#8a9a8a';
const ACCENT = '#4ade80';

/**
 * Every rule is inlined and the layout is tables: Gmail drops `<style>` blocks
 * and Outlook's Word engine ignores most modern CSS.
 */
export function verificationEmailHtml(verificationUrl: string, appUrl: string): string {
	const backdrop = `${appUrl}/email/comb-backdrop.png`;

	return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Stops Gmail and Outlook.com from force-inverting the palette; the design is already dark. -->
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${SUBJECT}</title>
</head>
<body style="margin:0; padding:0; background-color:${BACKGROUND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BACKGROUND};">
<tr>
<td align="center" style="padding:32px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; border-radius:12px; overflow:hidden;">
<tr>
<!--
  The comb is a flat image, not the app's animated SVG: no email client runs CSS
  animation, and none render an SVG <pattern>. bgcolor is the fallback that
  matters — images are blocked by default in Gmail and Outlook, and without it
  the light text would land on white.
-->
<td
  background="${backdrop}"
  bgcolor="${BACKDROP_EDGE}"
  style="background-color:${BACKDROP_EDGE}; background-image:url('${backdrop}'); background-position:top center; background-repeat:no-repeat; padding:40px 40px 36px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"
>

  <p style="margin:0 0 28px 0; font-size:15px; font-weight:700; letter-spacing:-0.01em; color:${FOREGROUND};">
    Hivewise
  </p>

  <h1 style="margin:0 0 10px 0; font-size:24px; line-height:1.25; font-weight:700; letter-spacing:-0.02em; color:${FOREGROUND};">
    Witaj w Hivewise 🐝
  </h1>

  <p style="margin:0 0 28px 0; font-size:15px; line-height:1.6; color:${MUTED};">
    Kliknij przycisk poniżej, aby potwierdzić swój adres e-mail i aktywować konto.
  </p>

  <!-- Table-wrapped so the tap target is the whole button, not just the text. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
    <a
      href="${verificationUrl}"
      style="display:inline-block; padding:14px 28px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:15px; font-weight:700; line-height:1; color:${BACKGROUND}; text-decoration:none; border-radius:8px;"
    >Potwierdź e-mail</a>
  </td>
  </tr>
  </table>

  <p style="margin:32px 0 0 0; font-size:12px; line-height:1.6; color:${MUTED};">
    Jeśli nie zakładałeś konta w Hivewise, możesz zignorować tę wiadomość. Link wygasa po 24 godzinach.
  </p>

  <p style="margin:12px 0 0 0; font-size:12px; line-height:1.6; color:${MUTED};">
    Lub skopiuj poniższy link do przeglądarki:<br />
    <a href="${verificationUrl}" style="color:${ACCENT}; text-decoration:underline; word-break:break-all;">${verificationUrl}</a>
  </p>

</td>
</tr>
</table>

</td>
</tr>
</table>
</body>
</html>`;
}

export function verificationEmailText(verificationUrl: string): string {
	return [
		'Witaj w Hivewise',
		'',
		'Potwierdź swój adres e-mail, otwierając poniższy link:',
		verificationUrl,
		'',
		'Link wygasa po 24 godzinach.',
		'Jeśli nie zakładałeś konta w Hivewise, zignoruj tę wiadomość.',
	].join('\n');
}

/**
 * Throws on a rejected send. The SDK resolves `{ data, error }` rather than
 * rejecting, so awaiting it without reading `error` reports success for a
 * message Resend never accepted.
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
	const appUrl = resolveAppUrl();
	const verificationUrl = buildVerificationUrl(token, appUrl);

	const { error } = await getResend().emails.send({
		from: FROM,
		to: email,
		subject: SUBJECT,
		html: verificationEmailHtml(verificationUrl, appUrl),
		text: verificationEmailText(verificationUrl),
	});

	if (error) {
		throw new Error(`Resend rejected the verification email: ${error.message}`);
	}
}
