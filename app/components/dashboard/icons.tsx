/**
 * Inline SVGs traced from `context/templates/dashboard.html`. Every icon draws
 * with `stroke: currentColor` and no fill, so colour comes from the parent's
 * text colour and nothing here needs to know about the token set.
 */

/** Honeycomb cell in the sidebar logo tile. Pointy-top, drawn to a 14×14 box. */
export function HexIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 14 14'
			aria-hidden='true'
			className={className}
		>
			<polygon points='7,1 1.8,4 1.8,10 7,13 12.2,10 12.2,4' />
		</svg>
	);
}

export function GridIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<rect
				x='3'
				y='3'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='14'
				y='3'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='3'
				y='14'
				width='7'
				height='7'
				rx='1'
			/>
			<rect
				x='14'
				y='14'
				width='7'
				height='7'
				rx='1'
			/>
		</svg>
	);
}

export function ChartIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
		</svg>
	);
}

export function UserIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<circle
				cx='12'
				cy='8'
				r='4'
			/>
			<path d='M4 20c0-4 3.6-7 8-7s8 3 8 7' />
		</svg>
	);
}

export function PlusIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			aria-hidden='true'
			className={className}
		>
			<line
				x1='12'
				y1='5'
				x2='12'
				y2='19'
			/>
			<line
				x1='5'
				y1='12'
				x2='19'
				y2='12'
			/>
		</svg>
	);
}
