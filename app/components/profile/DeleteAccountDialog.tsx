'use client';

import { Dialog, Portal } from '@ark-ui/react';
import { useRef, useState } from 'react';

import { TrashIcon, WarningIcon } from '@/app/components/dashboard/icons';
import { signOutAction } from '@/app/lib/auth-actions';
import { DELETE_CONFIRMATION_PHRASE, isDeleteConfirmed } from '@/app/lib/profile';

interface DeleteAccountDialogProps {
	/** What the account loses, spelled out rather than left to "all your data". */
	summary: string;
	/** True only for a subscription that is genuinely billed — see `hasBillableSubscription`. */
	blocked: boolean;
	/** Premium but not billed: warn about the forfeit, do not block. */
	warnPremiumForfeit: boolean;
}

const DANGER_BUTTON =
	'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-danger/50 bg-danger/10 px-4 text-[14px] font-semibold text-danger transition-colors hover:border-danger hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-danger/50 disabled:hover:bg-danger/10';

export function DeleteAccountDialog({ summary, blocked, warnPremiumForfeit }: DeleteAccountDialogProps) {
	const [confirmation, setConfirmation] = useState('');
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);
	const signOutForm = useRef<HTMLFormElement>(null);

	const confirmed = isDeleteConfirmed(confirmation);

	async function onDelete() {
		setError(undefined);
		setPending(true);

		let response: Response;

		try {
			response = await fetch('/api/account/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmation }),
			});
		} catch {
			setError('Brak połączenia z serwerem. Spróbuj ponownie.');
			setPending(false);
			return;
		}

		if (!response.ok) {
			const body: { error?: string; fieldErrors?: { confirmation?: string[] } } = await response
				.json()
				.catch(() => ({}));

			setError(body.fieldErrors?.confirmation?.[0] ?? body.error ?? 'Nie udało się usunąć konta. Spróbuj ponownie.');
			setPending(false);
			return;
		}

		/*
		 * The row is gone but the cookie is not — sessions are JWTs, so nothing
		 * server-side could revoke it. Signing out is what actually ends the
		 * session, and it navigates to `/`, so `pending` is deliberately left on:
		 * re-enabling the button during the redirect only invites a second click.
		 */
		signOutForm.current?.requestSubmit();
	}

	return (
		<>
			{/* Outside the dialog: `unmountOnExit` takes everything inside `Content`,
			    and this form has to outlive the close that a successful delete causes. */}
			<form
				ref={signOutForm}
				action={signOutAction}
				className='hidden'
			/>

			<Dialog.Root
				lazyMount
				unmountOnExit
				// Reset between openings, so a half-typed phrase or a stale error from
				// a previous attempt is never what greets the next one.
				onOpenChange={() => {
					setConfirmation('');
					setError(undefined);
				}}
			>
				{/* `self-start` so it does not stretch to the danger card's width — a
				    destructive control should not be the largest target on the page. */}
				<Dialog.Trigger
					disabled={blocked}
					className={`${DANGER_BUTTON} self-start`}
				>
					<TrashIcon className='h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]' />
					Usuń konto
				</Dialog.Trigger>

				<Portal>
					<Dialog.Backdrop className='fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]' />
					<Dialog.Positioner className='fixed inset-0 z-50 flex items-center justify-center p-4'>
						<Dialog.Content className='flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border-2 bg-surface-2 p-5 shadow-2xl shadow-black/60 focus:outline-none'>
							<Dialog.Title className='mb-1.5 flex items-center gap-2 text-[16px] font-semibold text-foreground'>
								<WarningIcon className='h-4.5 w-4.5 shrink-0 fill-none stroke-danger stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]' />
								Usunąć konto na stałe?
							</Dialog.Title>

							<Dialog.Description className='text-[13px] leading-relaxed text-muted'>
								Tej operacji nie można cofnąć. Usuniemy {summary}. Nie da się ich później odzyskać.
							</Dialog.Description>

							{warnPremiumForfeit && (
								<p className='mt-3 rounded-md border border-accent-warm/40 bg-accent-warm/10 px-3 py-2.5 text-[12px] leading-relaxed text-accent-warm'>
									Twoje konto ma plan Premium. Usunięcie konta oznacza utratę pozostałego okresu bez zwrotu.
								</p>
							)}

							<label className='mt-4 flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-muted'>
									Wpisz <span className='font-mono text-foreground'>{DELETE_CONFIRMATION_PHRASE}</span>, aby potwierdzić
								</span>
								<input
									value={confirmation}
									onChange={(event) => setConfirmation(event.target.value)}
									// The phrase is case-sensitive, so every helpful correction a
									// mobile keyboard offers works against it.
									autoComplete='off'
									autoCapitalize='none'
									autoCorrect='off'
									spellCheck={false}
									aria-invalid={!!error}
									placeholder={DELETE_CONFIRMATION_PHRASE}
									className='min-h-11 w-full rounded-md border border-border-2 bg-surface px-3 py-2.5 font-mono text-[14px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-danger aria-invalid:border-danger'
								/>
							</label>

							{error && (
								<p
									role='alert'
									className='mt-2 text-[12px] text-danger'
								>
									{error}
								</p>
							)}

							{/* Column-reverse on phones: the destructive action sits at the
							    bottom of the stack, furthest from a thumb resting on the edge. */}
							<div className='mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
								<Dialog.CloseTrigger className='inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border-2 bg-surface-2 px-4 text-[14px] font-medium text-muted transition-colors hover:border-border-3 hover:text-foreground'>
									Anuluj
								</Dialog.CloseTrigger>

								<button
									type='button'
									onClick={onDelete}
									disabled={!confirmed || pending}
									className={DANGER_BUTTON}
								>
									{pending ? 'Usuwanie…' : 'Usuń konto na stałe'}
								</button>
							</div>
						</Dialog.Content>
					</Dialog.Positioner>
				</Portal>
			</Dialog.Root>
		</>
	);
}
