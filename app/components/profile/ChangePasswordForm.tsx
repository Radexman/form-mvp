'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { AuthFormError, PasswordField } from '@/app/components/auth/fields';
import { signOutAfterPasswordChangeAction } from '@/app/lib/auth-actions';
import { changePasswordSchema, MIN_PASSWORD_LENGTH, type ChangePasswordValues } from '@/app/lib/auth.schema';

interface ChangePasswordErrorBody {
	error?: string;
	fieldErrors?: Partial<Record<keyof ChangePasswordValues, string[]>>;
}

const FIELDS = ['currentPassword', 'password', 'confirmPassword'] as const;

/**
 * Rendered only for accounts that have a password — see the page. The endpoint
 * refuses an OAuth-only account on its own, so this is presentation, not the
 * check.
 */
export function ChangePasswordForm() {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ChangePasswordValues>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
	});

	async function onSubmit(values: ChangePasswordValues) {
		let response: Response;

		try {
			response = await fetch('/api/account/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
		} catch {
			setError('root', { message: 'Brak połączenia z serwerem. Spróbuj ponownie.' });
			return;
		}

		if (response.ok) {
			/**
			 * No success banner, because there is no page left to show it on. The
			 * write stamps `passwordChangedAt`, which the `jwt` callback reads as
			 * "every token older than this is spent" — including the one in this
			 * browser. Signing out deliberately lands on `/sign-in?reset=1`, which
			 * says the password was changed and asks for the new one; leaving it to
			 * the next request instead would bounce the user out of `/profile` with
			 * no explanation at all.
			 */
			await signOutAfterPasswordChangeAction();
			return;
		}

		const body: ChangePasswordErrorBody = await response.json().catch(() => ({}));

		let handled = false;

		for (const field of FIELDS) {
			const message = body.fieldErrors?.[field]?.[0];

			if (message) {
				setError(field, { message });
				handled = true;
			}
		}

		if (!handled) {
			setError('root', { message: body.error ?? 'Nie udało się zmienić hasła. Spróbuj ponownie.' });
		}
	}

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			className='flex flex-col gap-4'
		>
			<AuthFormError message={errors.root?.message} />

			<PasswordField
				label='Aktualne hasło'
				autoComplete='current-password'
				placeholder='••••••••'
				error={errors.currentPassword?.message}
				{...register('currentPassword')}
			/>

			<PasswordField
				label='Nowe hasło'
				autoComplete='new-password'
				placeholder={`Co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
				error={errors.password?.message}
				showRequirements
				{...register('password')}
			/>

			<PasswordField
				label='Powtórz nowe hasło'
				autoComplete='new-password'
				placeholder='••••••••'
				error={errors.confirmPassword?.message}
				{...register('confirmPassword')}
			/>

			{/* Not `SubmitButton`: that one is full-width for the auth pages, where it
			    is the only thing on the card. Here it sits under a form inside a
			    settings card and should not span the column. */}
			<button
				type='submit'
				disabled={isSubmitting}
				className='inline-flex min-h-11 cursor-pointer items-center justify-center self-start rounded-md bg-accent px-4 text-[14px] font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60'
			>
				{isSubmitting ? 'Zapisywanie…' : 'Zmień hasło'}
			</button>
		</form>
	);
}
