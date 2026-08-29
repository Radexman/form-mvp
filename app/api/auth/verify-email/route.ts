import { isVerificationTokenExpired } from '@/app/lib/email/verification-token';
import { prisma } from '@/app/lib/prisma';

/**
 * Consumes the link from the verification email. Every outcome lands back on
 * `/sign-in`, which reads the query param and says what happened — an
 * already-verified account is a success from the user's point of view, not an
 * error, because clicking twice is the most common way to reach it.
 */
export async function GET(request: Request) {
	const token = new URL(request.url).searchParams.get('token');

	if (!token) {
		return redirectTo(request, '/sign-in?error=invalid_token');
	}

	const user = await prisma.user.findUnique({
		where: { verificationToken: token },
		select: { id: true, emailVerified: true, verificationTokenExpiresAt: true },
	});

	// A superseded token (the user asked for a new link) and one that never
	// existed are answered identically — neither is told which it was.
	if (!user) {
		return redirectTo(request, '/sign-in?error=invalid_token');
	}

	if (user.emailVerified) {
		return redirectTo(request, '/sign-in?verified=already');
	}

	if (isVerificationTokenExpired(user.verificationTokenExpiresAt, new Date())) {
		return redirectTo(request, '/sign-in?error=invalid_token');
	}

	// The token stays on the row. Nulling it here would make the second click on
	// the same link indistinguishable from a forged one, and a double click is
	// the ordinary case — mail clients and link scanners fetch the URL before the
	// user ever does. `emailVerified` above is what makes the token inert: it can
	// no longer verify anything, only produce the "already done" message. Any
	// re-send overwrites it.
	await prisma.user.update({
		where: { id: user.id },
		data: { emailVerified: new Date() },
	});

	return redirectTo(request, '/sign-in?verified=true');
}

function redirectTo(request: Request, path: string): Response {
	return Response.redirect(new URL(path, request.url), 303);
}
