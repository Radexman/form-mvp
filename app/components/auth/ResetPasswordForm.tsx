'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { MIN_PASSWORD_LENGTH, resetPasswordSchema, type ResetPasswordValues } from '@/app/lib/auth.schema';

import { AuthFormError, PasswordField, SubmitButton } from './fields';

interface ResetPasswordErrorBody {
	error?: string;
	fieldErrors?: Partial<Record<keyof ResetPasswordValues | 'token', string[]>>;
}

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<ResetPasswordValues>({
		resolver: zodResolver(resetPasswordSchema),
		defaultValues: { password: '', confirmPassword: '' },
	});

	async function onSubmit(values: ResetPasswordValues) {
		let response: Response;

		try {
			response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...values, token }),
			});
		} catch {
			setError('root', { message: 'Brak połączenia z serwerem. Spróbuj ponownie.' });
			return;
		}

		if (response.ok) {
			router.push('/sign-in?reset=1');
			return;
		}

		const body: ResetPasswordErrorBody = await response.json().catch(() => ({}));

		for (const field of ['password', 'confirmPassword'] as const) {
			const message = body.fieldErrors?.[field]?.[0];

			if (message) {
				setError(field, { message });
			}
		}

		// A dead token is not a field the user can fix — the page validated it on
		// load, so reaching this means it expired or was spent while the form sat
		// open. It belongs at form level, with the link back to a fresh one.
		if (!body.fieldErrors?.password && !body.fieldErrors?.confirmPassword) {
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

			<SubmitButton pending={isSubmitting}>{isSubmitting ? 'Zapisywanie…' : 'Ustaw nowe hasło'}</SubmitButton>
		</form>
	);
}
