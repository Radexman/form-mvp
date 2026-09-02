import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Phone on the LAN. Previously set via a stray `module.exports` here, which
	// never took effect — the loader reads the default export.
	allowedDevOrigins: ['192.168.1.16'],

	logging: {
		/**
		 * Off because Next logs each Server Function call with its *arguments*, and
		 * `signInAction` takes `{ email, password }` — so every sign-in in `next dev`
		 * would otherwise print a real password into the terminal, and from there
		 * into scrollback, a screen share, or a CI job's captured output.
		 *
		 * The reset and change-password flows dodged this by being route handlers
		 * rather than actions (both say so in their own comments); sign-in has to go
		 * through `signIn()`, which only exists server-side. This covers it, and any
		 * future action that ends up holding something secret.
		 *
		 * Development-only either way — Next does not log these in production.
		 */
		serverFunctions: false,
	},

	images: {
		remotePatterns: [
			{
				protocol: 'https',
				// Where Google serves the avatar Auth.js stores on `User.image`.
				hostname: 'lh3.googleusercontent.com',
				pathname: '/a/**',
			},
		],
	},
};

export default nextConfig;
