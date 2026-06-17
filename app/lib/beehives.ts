export interface Beehive {
	id: string;
	number: number;
	nextInspectionNumber: number;
}

export const BEEHIVES: Beehive[] = [
	{ id: 'hive-1', number: 1, nextInspectionNumber: 1 },
	{ id: 'hive-2', number: 2, nextInspectionNumber: 1 },
	{ id: 'hive-3', number: 3, nextInspectionNumber: 1 },
	{ id: 'hive-4', number: 4, nextInspectionNumber: 1 },
	{ id: 'hive-5', number: 5, nextInspectionNumber: 1 },
];
