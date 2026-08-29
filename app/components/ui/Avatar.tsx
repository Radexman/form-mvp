'use client';

import Image from 'next/image';
import { useState } from 'react';

import { formatInitials } from '@/app/lib/dashboard';

interface AvatarProps {
	image: string | null;
	/** Full name — initials come from the first and last part. */
	name: string | null;
	size?: number;
	className?: string;
}

/**
 * Google photo when there is one, initials otherwise. Client-side only for
 * `onError`: a Google avatar URL 404s once the photo changes, and `next/image`
 * renders that as an empty box rather than falling back on its own.
 */
export function Avatar({ image, name, size = 28, className = '' }: AvatarProps) {
	const [failed, setFailed] = useState(false);

	const box = { width: size, height: size };

	if (image && !failed) {
		return (
			<Image
				src={image}
				alt=''
				width={size}
				height={size}
				// Always rendered beside the user's name, so alt text would double up.
				aria-hidden='true'
				onError={() => setFailed(true)}
				className={`shrink-0 rounded-full border border-border-2 object-cover ${className}`}
				style={box}
			/>
		);
	}

	return (
		<span
			aria-hidden='true'
			style={{ ...box, fontSize: Math.round(size * 0.39) }}
			className={`flex shrink-0 items-center justify-center rounded-full border border-border-2 bg-surface-3 font-semibold text-accent ${className}`}
		>
			{formatInitials(name)}
		</span>
	);
}
