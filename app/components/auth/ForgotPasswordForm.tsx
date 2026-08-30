'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { forgotPasswordSchema, type ForgotPasswordValues } from '@/app/lib/auth.schema';

import { AuthField, AuthFormError, SubmitButton } from './fields';

interface ForgotPasswordErrorBody {
	error?: string;
	fieldErrors?: Partial<Record<keyof ForgotPasswordValues, string[]>>;
}

export function ForgotPasswordForm() {
	const [sentTo, setSentTo] = useState<string>();

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ForgotPasswordValues>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: { email: '' },
	});

	async function onSubmit(values: ForgotPasswordValues) {
		let response: Response;

		try {
			response = await fetch('/api/auth/forgot-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
		} catch {
			setError('root', { message: 'Brak połączenia z serwerem. Spróbuj ponownie.' });
			return;
		}

		if (response.ok) {
			// The server normalises before storing; match it so the confirmation
			// names the address the email actually went to.
			setSentTo(values.email.trim().toLowerCase());
			return;
		}

		const body: ForgotPasswordErrorBody = await response.json().catch(() => ({}));

		if (body.fieldErrors?.email?.[0]) {
			setError('email', { message: body.fieldErrors.email[0] });
			return;
		}

		setError('root', { message: body.error ?? 'Nie udało się wysłać linku. Spróbuj ponownie.' });
	}

	/**
	 * Replaces the form rather than navigating. The confirmation is identical for
	 * a known and an unknown address, so putting it on its own URL would only give
	 * the address somewhere else to leak.
	 */
	if (sentTo) {
		return (
			<div
				role='status'
				className='flex flex-col gap-3'
			>
				<p className='rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-[13px] text-accent'>
					Jeśli konto o adresie <span className='font-medium'>{sentTo}</span> istnieje, wysłaliśmy na nie link do
					zresetowania hasła.
				</p>
				<p className='text-[13px] leading-relaxed text-subtle'>
					Wiadomość nie dotarła? Sprawdź folder ze spamem. Link wygasa po godzinie.
				</p>
			</div>
		);
	}

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			className='flex flex-col gap-4'
		>
			<AuthFormError message={errors.root?.message} />

			<AuthField
				label='Adres e-mail'
				type='email'
				autoComplete='email'
				placeholder='jan@pasieka.pl'
				error={errors.email?.message}
				{...register('email')}
			/>

			<SubmitButton pending={isSubmitting}>{isSubmitting ? 'Wysyłanie…' : 'Wyślij link'}</SubmitButton>
		</form>
	);
}
