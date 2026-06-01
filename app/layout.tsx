import type { Metadata } from 'next';
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
	title: 'MVP Form',
	description: 'Multi step inspection form',
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
