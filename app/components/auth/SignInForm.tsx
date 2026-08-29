'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { signInAction } from '@/app/lib/auth-actions';
import { signInSchema, type SignInValues } from '@/app/lib/auth.schema';

import { AuthField, AuthFormError, SubmitButton } from './fields';

/** On success the action redirects and never resolves; only failures return. */
export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<SignInValues>({
		resolver: zodResolver(signInSchema),
		defaultValues: { email: '', password: '' },
	});

	async function onSubmit(values: SignInValues) {
		const result = await signInAction(values, callbackUrl);

		// `root`, not a field — the server cannot say which of the two was wrong.
		if (result?.error) {
			setError('root', { message: result.error });
		}
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

			<AuthField
				label='Hasło'
				type='password'
				autoComplete='current-password'
				placeholder='••••••••'
				error={errors.password?.message}
				{...register('password')}
			/>

			<SubmitButton pending={isSubmitting}>{isSubmitting ? 'Logowanie…' : 'Zaloguj się'}</SubmitButton>
		</form>
	);
}
