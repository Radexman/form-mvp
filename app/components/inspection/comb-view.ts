'use client';

import { createContext, useContext } from 'react';

/**
 * Which frame the comb step is showing.
 *
 * Lifted out of StepComb because the spoken dialogue runs from the form and has
 * to keep the screen following the conversation — the chip strip should
 * highlight the frame being discussed.
 */
export interface CombView {
	active: number;
	setActive: (index: number | ((current: number) => number)) => void;
}

export const CombViewContext = createContext<CombView | null>(null);

export function useCombView(): CombView {
	const view = useContext(CombViewContext);
	if (!view) throw new Error('useCombView must be used inside CombViewContext');
	return view;
}
