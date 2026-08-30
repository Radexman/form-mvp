'use client';

import { Field } from '@ark-ui/react';
import { type ComponentPropsWithRef, useState } from 'react';

import { EyeIcon, EyeOffIcon } from '@/app/components/dashboard/icons';
import { PASSWORD_REQUIREMENTS } from '@/app/lib/auth.schema';

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

interface PasswordFieldProps extends Omit<AuthFieldProps, 'type'> {
	/** Show the rules checklist once the field is in error. Off for sign-in. */
	showRequirements?: boolean;
}

/**
 * Shown only once the field is in error: an untouched form should not open with
 * a list of demands, but a rejected one has to say what it wants — and which
 * parts are already met, so the user is not re-reading rules they have passed.
 */
function PasswordChecklist({ value }: { value: string }) {
	return (
		<ul className='mt-0.5 flex flex-col gap-1'>
			{PASSWORD_REQUIREMENTS.map((requirement) => {
				const met = requirement.test(value);

				return (
					<li
						key={requirement.label}
						className={`flex items-center gap-1.5 text-[12px] ${met ? 'text-accent' : 'text-subtle'}`}
					>
						<span aria-hidden='true'>{met ? '✓' : '•'}</span>
						{requirement.label}
					</li>
				);
			})}
		</ul>
	);
}

/**
 * A password input with a reveal toggle. The button is `type='button'`: inside a
 * form a bare `<button>` submits, so leaving it off would post the form on every
 * peek.
 */
export function PasswordField({ label, error, showRequirements, onChange, ...inputProps }: PasswordFieldProps) {
	const [revealed, setRevealed] = useState(false);
	// Tracked here rather than through the form's `watch`, so typing re-renders
	// only this field — and so the caller needs no wiring beyond the flag.
	const [value, setValue] = useState('');
	const Icon = revealed ? EyeOffIcon : EyeIcon;

	return (
		<Field.Root
			invalid={!!error}
			className='flex flex-col gap-1.5'
		>
			<Field.Label className='text-[13px] font-medium text-muted'>{label}</Field.Label>

			<div className='relative'>
				<Field.Input
					type={revealed ? 'text' : 'password'}
					className={`${CONTROL} pr-12`}
					{...inputProps}
					onChange={(event) => {
						setValue(event.target.value);
						onChange?.(event);
					}}
				/>

				<button
					type='button'
					onClick={() => setRevealed((shown) => !shown)}
					aria-label={revealed ? 'Ukryj hasło' : 'Pokaż hasło'}
					aria-pressed={revealed}
					// Not focusable: the toggle changes nothing a screen reader user
					// cannot already read, and sitting between the field and the submit
					// button it would add a stop to every keyboard pass through the form.
					tabIndex={-1}
					className='absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center text-subtle transition-colors hover:text-foreground'
				>
					<Icon className='h-4.5 w-4.5 fill-none stroke-current stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]' />
				</button>
			</div>

			<Field.ErrorText className='text-[12px] text-danger'>{error}</Field.ErrorText>

			{error && showRequirements && <PasswordChecklist value={value} />}
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
