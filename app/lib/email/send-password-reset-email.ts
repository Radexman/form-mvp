import { getResend } from '@/app/lib/resend';

import { buildPasswordResetUrl } from './password-reset-token';
import { resolveAppUrl } from './verification-token';

const FROM = 'Hivewise <onboarding@resend.dev>';
const SUBJECT = 'Zresetuj hasło — Hivewise';

const BACKGROUND = '#0d0f0d';
const BACKDROP_EDGE = '#0a0c0a';
const FOREGROUND = '#e8f0e8';
const MUTED = '#8a9a8a';
const ACCENT = '#4ade80';

/**
 * Tables and fully inlined rules, like the verification email: Gmail drops
 * `<style>` blocks and Outlook's Word engine ignores most modern CSS.
 */
export function passwordResetEmailHtml(resetUrl: string, appUrl: string): string {
	const backdrop = `${appUrl}/email/comb-backdrop.png`;

	return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
<!-- bgcolor beside background-image is load-bearing: images are blocked by
     default, and without it the light text would land on white. -->
<td
  background="${backdrop}"
  bgcolor="${BACKDROP_EDGE}"
  style="background-color:${BACKDROP_EDGE}; background-image:url('${backdrop}'); background-position:top center; background-repeat:no-repeat; padding:40px 40px 36px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"
>

  <p style="margin:0 0 28px 0; font-size:15px; font-weight:700; letter-spacing:-0.01em; color:${FOREGROUND};">
    Hivewise
  </p>

  <h1 style="margin:0 0 10px 0; font-size:24px; line-height:1.25; font-weight:700; letter-spacing:-0.02em; color:${FOREGROUND};">
    Zresetuj swoje hasło
  </h1>

  <p style="margin:0 0 28px 0; font-size:15px; line-height:1.6; color:${MUTED};">
    Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta. Kliknij przycisk poniżej, aby ustawić nowe hasło.
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
  <td align="center" bgcolor="${ACCENT}" style="border-radius:8px;">
    <a
      href="${resetUrl}"
      style="display:inline-block; padding:14px 28px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; font-size:15px; font-weight:700; line-height:1; color:${BACKGROUND}; text-decoration:none; border-radius:8px;"
    >Ustaw nowe hasło</a>
  </td>
  </tr>
  </table>

  <p style="margin:32px 0 0 0; font-size:12px; line-height:1.6; color:${MUTED};">
    Link wygasa po godzinie i może zostać użyty tylko raz. Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.
  </p>

  <p style="margin:12px 0 0 0; font-size:12px; line-height:1.6; color:${MUTED};">
    Lub skopiuj poniższy link do przeglądarki:<br />
    <a href="${resetUrl}" style="color:${ACCENT}; text-decoration:underline; word-break:break-all;">${resetUrl}</a>
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

export function passwordResetEmailText(resetUrl: string): string {
	return [
		'Zresetuj swoje hasło w Hivewise',
		'',
		'Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta. Otwórz poniższy link, aby ustawić nowe hasło:',
		resetUrl,
		'',
		'Link wygasa po godzinie i może zostać użyty tylko raz.',
		'Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.',
	].join('\n');
}

/**
 * Throws on a rejected send. The SDK resolves `{ data, error }` rather than
 * rejecting, so awaiting it without reading `error` reports success for a
 * message Resend never accepted.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
	const appUrl = resolveAppUrl();
	const resetUrl = buildPasswordResetUrl(token, appUrl);

	const { error } = await getResend().emails.send({
		from: FROM,
		to: email,
		subject: SUBJECT,
		html: passwordResetEmailHtml(resetUrl, appUrl),
		text: passwordResetEmailText(resetUrl),
	});

	if (error) {
		throw new Error(`Resend rejected the password reset email: ${error.message}`);
	}
}
