'use client';

import type { Beehive } from '../../lib/beehives';

function HiveCard({ hive, onSelect }: { hive: Beehive; onSelect: (hive: Beehive) => void }) {
	return (
		<div className='flex flex-col gap-4 rounded-lg border border-border bg-surface p-5'>
			<span className='text-4xl font-semibold leading-none text-foreground'>{hive.number}</span>
			<button
				type='button'
				onClick={() => onSelect(hive)}
				className='rounded-md bg-accent px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-accent-dim hover:text-foreground'
			>
				Przegląd
			</button>
		</div>
	);
}

export function BeehivePicker({ hives, onSelect }: { hives: Beehive[]; onSelect: (hive: Beehive) => void }) {
	return (
		<section className='flex flex-col gap-4'>
			<h1 className='text-xs uppercase tracking-widest text-subtle'>Ule</h1>
			<div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
				{hives.map((hive) => (
					<HiveCard
						key={hive.id}
						hive={hive}
						onSelect={onSelect}
					/>
				))}
			</div>
		</section>
	);
}
