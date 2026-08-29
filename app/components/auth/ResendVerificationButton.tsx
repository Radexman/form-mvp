'use client';

import { useState, useTransition } from 'react';

import type { ResendResult } from '@/app/lib/email/verification-actions';

interface ResendVerificationButtonProps {
	action: () => Promise<ResendResult>;
	label?: string;
}

export function ResendVerificationButton({ action, label = 'Wyślij ponownie' }: ResendVerificationButtonProps) {
	const [pending, startTransition] = useTransition();
	const [result, setResult] = useState<ResendResult>();

	function onClick() {
		startTransition(async () => {
			setResult(await action());
		});
	}

	return (
		<div className='flex flex-col gap-3'>
			<button
				type='button'
				onClick={onClick}
				disabled={pending}
				className='inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md border border-border-2 bg-surface-2 px-4 text-[14px] font-medium text-foreground transition-colors hover:border-border-3 disabled:cursor-not-allowed disabled:opacity-60'
			>
				{pending ? 'Wysyłanie…' : label}
			</button>

			{result && (
				<p
					role='status'
					className={
						result.ok
							? 'rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-[13px] text-accent'
							: 'rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger'
					}
				>
					{result.message}
				</p>
			)}
		</div>
	);
}
