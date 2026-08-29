import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Phone on the LAN. Previously set via a stray `module.exports` here, which
	// never took effect — the loader reads the default export.
	allowedDevOrigins: ['192.168.1.16'],

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
