// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InspectionForm } from './InspectionForm';

/**
 * The reason this suite exists: every field-level message is inside a step
 * panel, and the stepper renders non-current panels with `hidden`. A message in
 * the document proves nothing — the bug being fixed had "Znakowana matka musi
 * mieć kolor" rendered at 0x0 while the submit button did nothing at all. So
 * the assertions go through role queries, which skip whatever the accessibility
 * tree hides, and `visible()` re-checks that no ancestor is hidden.
 */

const HIVE = { id: 'hive-1', number: 1, nextInspectionNumber: 1 };

vi.mock('../../lib/inspection-context', () => ({
	fetchCurrentWeather: vi.fn(async () => null),
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

// jsdom has no object-URL support, and an anchor that actually navigates would
// take the test with it.
URL.createObjectURL = () => 'blob:pdf';
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = () => {};

function visible(element: HTMLElement) {
	return !element.closest('[hidden]') && getComputedStyle(element).display !== 'none';
}

/**
 * A control's value reaches the form a microtask after its click, so anything
 * that validates has to be a tick behind it — as it is for a real thumb.
 */
async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

function setUp() {
	render(
		<InspectionForm
			hive={HIVE}
			onBack={() => {}}
		/>,
	);
}

/** The title of the step on screen — the indicator's number is not part of it. */
function currentStepTitle() {
	return screen.getByRole('tab', { selected: true }).textContent?.replace(/^\d+/, '');
}

async function next() {
	fireEvent.click(screen.getByRole('button', { name: 'Dalej' }));
	await settle();
}

async function goToTab(name: string) {
	fireEvent.click(screen.getByRole('tab', { name }));
	await settle();
}

async function choose(name: string) {
	fireEvent.click(screen.getByRole('radio', { name }));
	await settle();
}

/** Plastry i zasoby validates on its defaults, so Dalej alone reaches Matka. */
async function startOnQueen() {
	setUp();
	await next();
	await screen.findByRole('tab', { name: 'Matka', selected: true });
}

/** The answers the reported inspection gave before the queen was marked. */
async function fillQueen() {
	await choose('Widziana');
	await choose('Brak');
}

/** Every step answered and confirmed with Dalej, ending on Podsumowanie. */
async function walkToSummary() {
	await startOnQueen();
	await fillQueen();
	await next();

	await choose('4 stars');
	await next();

	await choose('Spokojne');
	await choose('Wystarczająca');
	await next();

	await next(); // Zdrowie rodziny — valid on its defaults
	await next(); // Wykonane działania — valid on its defaults
	await next(); // Uwagi — valid on its defaults
	await screen.findByRole('tab', { name: 'Podsumowanie', selected: true });
}

describe('leaving a step the schema rejects', () => {
	it('names the section on screen instead of refusing in silence', async () => {
		await startOnQueen();

		await goToTab('Podsumowanie');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Popraw błędy w sekcji: Matka.');
		expect(visible(alert)).toBe(true);
		expect(currentStepTitle()).toBe('Matka');
	});

	it('says the same when Dalej is the one refusing', async () => {
		await startOnQueen();

		await next();

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Popraw błędy w sekcji: Matka.');
		expect(visible(alert)).toBe(true);
	});
});

describe('a step edited after it was confirmed', () => {
	it('is re-validated on the way back, with a visible reason', async () => {
		await startOnQueen();
		await fillQueen();
		await next();
		await screen.findByRole('tab', { name: 'Czerw', selected: true });

		// Back to Matka by the step indicator — the route that used to launder an
		// edit, because it never passes through Dalej.
		await goToTab('Matka');
		fireEvent.click(screen.getByRole('checkbox', { name: 'Znakowana' }));
		await settle();

		await goToTab('Czerw');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Popraw błędy w sekcji: Matka.');
		expect(visible(alert)).toBe(true);
		expect(currentStepTitle()).toBe('Matka');
		// And the field itself now says why, on the panel being looked at.
		expect(visible(screen.getByText('Znakowana matka musi mieć kolor'))).toBe(true);
	});

	it('does not stand in the way of a complete inspection', async () => {
		await walkToSummary();

		expect(currentStepTitle()).toBe('Podsumowanie');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByRole('button', { name: 'Zapisz i pobierz PDF' })).toBeTruthy();
	});

	it('lets a corrected step through without a second attempt', async () => {
		await startOnQueen();
		await fillQueen();
		await next();
		await screen.findByRole('tab', { name: 'Czerw', selected: true });

		await goToTab('Matka');
		await choose('Niewidziana, czerw OK');

		await goToTab('Czerw');

		await waitFor(() => expect(currentStepTitle()).toBe('Czerw'));
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

describe('submitting a form the schema accepts', () => {
	function pdfResponse() {
		return {
			ok: true,
			blob: async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
			headers: { get: () => 'attachment; filename="przeglad-1-1.pdf"' },
		} as unknown as Response;
	}

	it('says Generowanie… while the request is out, then goes quiet', async () => {
		let finish: (response: Response) => void = () => {};
		const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
		vi.stubGlobal('fetch', fetchSpy);
		await walkToSummary();

		fireEvent.click(screen.getByRole('button', { name: 'Zapisz i pobierz PDF' }));
		await settle();

		const button = await screen.findByRole('button', { name: 'Generowanie…' });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(fetchSpy).toHaveBeenCalledWith('/api/generate-pdf', expect.objectContaining({ method: 'POST' }));

		await act(async () => {
			finish(pdfResponse());
		});

		await screen.findByRole('button', { name: 'Zapisz i pobierz PDF' });
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('still shows the request failure when the service is down', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: false, status: 502 }) as unknown as Response),
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await walkToSummary();

		fireEvent.click(screen.getByRole('button', { name: 'Zapisz i pobierz PDF' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Nie udało się wygenerować PDF');
		expect(visible(alert)).toBe(true);
	});
});
