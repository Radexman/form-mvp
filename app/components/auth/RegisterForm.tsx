'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { registerSchema, type RegisterValues } from '@/app/lib/auth.schema';

import { AuthField, AuthFormError, SubmitButton } from './fields';

interface RegisterErrorBody {
	error?: string;
	fieldErrors?: Partial<Record<keyof RegisterValues, string[]>>;
}

/**
 * Posts to the route handler, not a server action — it already exists and its
 * status codes carry meaning (409 taken vs 400 invalid). Does not sign anyone
 * in; hands off to `/register/check-email`.
 */
export function RegisterForm() {
	const router = useRouter();

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<RegisterValues>({
		resolver: zodResolver(registerSchema),
		defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
	});

	async function onSubmit(values: RegisterValues) {
		let response: Response;

		try {
			response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(values),
			});
		} catch {
			// `fetch` only rejects on transport failure; every status resolves.
			setError('root', { message: 'Brak połączenia z serwerem. Spróbuj ponownie.' });
			return;
		}

		if (response.ok) {
			// The route normalises the address before storing it; re-normalise here
			// so the confirmation page names the same one the email went to.
			router.push(`/register/check-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`);
			return;
		}

		const body: RegisterErrorBody = await response.json().catch(() => ({}));

		for (const [field, messages] of Object.entries(body.fieldErrors ?? {})) {
			if (messages?.[0]) {
				setError(field as keyof RegisterValues, { message: messages[0] });
			}
		}

		// 409 arrives without `fieldErrors`; email is the field the user must change.
		if (response.status === 409) {
			setError('email', { message: body.error ?? 'Konto z tym adresem e-mail już istnieje' });
			return;
		}

		if (!body.fieldErrors) {
			setError('root', { message: body.error ?? 'Nie udało się utworzyć konta. Spróbuj ponownie.' });
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
				label='Imię i nazwisko'
				type='text'
				autoComplete='name'
				placeholder='Jan Pszczelarz'
				error={errors.name?.message}
				{...register('name')}
			/>

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
				autoComplete='new-password'
				placeholder='Co najmniej 8 znaków'
				error={errors.password?.message}
				{...register('password')}
			/>

			<AuthField
				label='Powtórz hasło'
				type='password'
				autoComplete='new-password'
				placeholder='••••••••'
				error={errors.confirmPassword?.message}
				{...register('confirmPassword')}
			/>

			<SubmitButton pending={isSubmitting}>{isSubmitting ? 'Tworzenie konta…' : 'Utwórz konto'}</SubmitButton>
		</form>
	);
}
