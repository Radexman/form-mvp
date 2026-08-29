import { HexIcon } from '@/app/components/dashboard/icons';

/**
 * Brand and welcome copy, `lg` and up. No background of its own — it sits on the
 * uncovered half of `AuthBackdrop` and claims the width that pushes the form
 * into the other half.
 */
export function AuthShowcase() {
	return (
		<section className='relative hidden w-1/2 shrink-0 border-r border-r-border lg:block'>
			<div className='flex h-full flex-col p-10 xl:p-14'>
				<div className='flex items-center gap-2.5'>
					<span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent'>
						<HexIcon className='h-4.5 w-4.5 fill-none stroke-background stroke-[2.5] [stroke-linejoin:round]' />
					</span>
					<span className='text-[15px] font-semibold tracking-[-0.01em] text-foreground'>Hivewise</span>
				</div>

				<div className='flex flex-1 flex-col justify-center'>
					<div className='max-w-lg'>
						{/* A <p>, not an <h2> — this column precedes the page's <h1> in the DOM.
						    The line break is hard, so oversizing splits it onto a third line:
						    the ceiling is ~57px at `lg` and ~68px above `xl`. */}
						<p className='text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] text-foreground lg:text-5xl xl:text-6xl'>
							Twoja pasieka
							<br />
							zawsze pod ręką
						</p>
						<p className='mt-5 max-w-md text-[16px] leading-relaxed text-foreground/70 xl:text-[17px]'>
							Zapisuj przeglądy prosto w pasiece, śledź kondycję każdej rodziny i wracaj do pełnej historii ula — z
							telefonu i z komputera.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
