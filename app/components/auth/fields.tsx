'use client';

import { Field } from '@ark-ui/react';
import type { ComponentPropsWithRef } from 'react';

/**
 * Shared inputs and buttons for the auth forms. Plain props rather than
 * react-hook-form context, so `{...register('email')}` spreads onto the input
 * without the component having to be generic over both form shapes.
 */

const CONTROL =
	'w-full min-h-11 rounded-md border border-border-2 bg-surface-2 px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-accent data-invalid:border-danger';

interface AuthFieldProps extends ComponentPropsWithRef<'input'> {
	label: string;
	error?: string;
}

export function AuthField({ label, error, ...inputProps }: AuthFieldProps) {
	return (
		<Field.Root
			invalid={!!error}
			className='flex flex-col gap-1.5'
		>
			<Field.Label className='text-[13px] font-medium text-muted'>{label}</Field.Label>
			<Field.Input
				className={CONTROL}
				{...inputProps}
			/>
			<Field.ErrorText className='text-[12px] text-danger'>{error}</Field.ErrorText>
		</Field.Root>
	);
}

/** Form-wide message. `role="alert"` so it is announced when it appears. */
export function AuthFormError({ message }: { message?: string }) {
	if (!message) return null;

	return (
		<p
			role='alert'
			className='rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-danger'
		>
			{message}
		</p>
	);
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
	return (
		<button
			type='submit'
			disabled={pending}
			className='inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md bg-accent px-4 text-[14px] font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60'
		>
			{children}
		</button>
	);
}

export function AuthDivider() {
	return (
		<div className='flex items-center gap-3'>
			<span className='h-px flex-1 bg-border-2' />
			<span className='text-[12px] text-muted'>lub</span>
			<span className='h-px flex-1 bg-border-2' />
		</div>
	);
}
