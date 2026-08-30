'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { MIN_PASSWORD_LENGTH, registerSchema, type RegisterValues } from '@/app/lib/auth.schema';

import { AuthField, AuthFormError, PasswordField, SubmitButton } from './fields';

interface RegisterErrorBody {
	error?: string;
	fieldErrors?: Partial<Record<keyof RegisterValues, string[]>>;
}

interface RegisterSuccessBody {
	verificationRequired?: boolean;
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
			const body: RegisterSuccessBody = await response.json().catch(() => ({}));

			// The server owns the flag; the client only reads the outcome off the
			// response. With verification off there is no link to wait for, so the
			// "check your inbox" step would be a dead end.
			if (body.verificationRequired === false) {
				router.push('/sign-in?registered=1');
				return;
			}

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

			<PasswordField
				label='Hasło'
				autoComplete='new-password'
				placeholder={`Co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
				error={errors.password?.message}
				showRequirements
				{...register('password')}
			/>

			<PasswordField
				label='Powtórz hasło'
				autoComplete='new-password'
				placeholder='••••••••'
				error={errors.confirmPassword?.message}
				{...register('confirmPassword')}
			/>

			<SubmitButton pending={isSubmitting}>{isSubmitting ? 'Tworzenie konta…' : 'Utwórz konto'}</SubmitButton>
		</form>
	);
}
