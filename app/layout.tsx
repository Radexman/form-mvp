import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
	variable: '--font-dm-sans',
	subsets: ['latin'],
	weight: ['400', '500', '600'],
});

const dmMono = DM_Mono({
	variable: '--font-dm-mono',
	subsets: ['latin'],
	weight: ['400', '500'],
});

export const metadata: Metadata = {
	title: 'Hivewise',
	description: 'Multi step inspection form',
};

export const viewport: Viewport = {
	// Lets the dashboard's bottom tab bar pad itself past the iOS home indicator:
	// without `cover`, env(safe-area-inset-*) resolves to 0.
	viewportFit: 'cover',
	themeColor: '#0d0f0d',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang='pl'
			className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}
		>
			<body className='min-h-full flex flex-col bg-background text-foreground'>{children}</body>
		</html>
	);
}
