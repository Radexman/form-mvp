import apiaryProfile from '@/apiary.json';
import type { InspectionMeta } from '../../lib/inspection-context';

export function buildMeta(hiveNumber: string | number, inspectionNumber: string | number): InspectionMeta {
	return {
		apiary_name: apiaryProfile.apiary_name,
		beekeeper_name: apiaryProfile.beekeeper_name,
		veterinary_number: apiaryProfile.veterinary_number,
		hive_number: String(hiveNumber),
		inspection_number: String(inspectionNumber),
		inspection_date: new Date().toISOString().slice(0, 10),
	};
}

const PL_MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export function formatDatePl(iso: string): string {
	const [year, month, day] = iso.split('-').map(Number);
	if (!year || !month || !day) return iso;
	return `${day} ${PL_MONTHS_SHORT[month - 1]} ${year}`;
}

type LabelOption = { value: string; label: string };

export function labelOf(options: LabelOption[], value: string | null | undefined): string {
	if (value == null) return '—';
	return options.find((option) => option.value === value)?.label ?? value;
}

export function labelsOf(options: LabelOption[], values: string[] | null | undefined): string[] {
	if (!values?.length) return [];
	return values.map((value) => options.find((option) => option.value === value)?.label ?? value);
}
