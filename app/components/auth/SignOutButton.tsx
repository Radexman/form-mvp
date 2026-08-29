import { signOutAction } from '@/app/lib/auth-actions';

/** A form, not an onClick — a GET that destroys a session is a CSRF hazard. */
export function SignOutButton() {
	return (
		<form action={signOutAction}>
			<button
				type='submit'
				className='cursor-pointer text-[13px] text-muted transition-colors hover:text-foreground'
			>
				Wyloguj się i użyj innego konta
			</button>
		</form>
	);
}
