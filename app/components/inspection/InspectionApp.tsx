'use client';

import { useState } from 'react';

import { BEEHIVES, type Beehive } from '../../lib/beehives';
import { BeehivePicker } from './BeehivePicker';
import { InspectionForm } from './InspectionForm';

export function InspectionApp() {
	const [hive, setHive] = useState<Beehive | null>(null);

	if (!hive) {
		return (
			<BeehivePicker
				hives={BEEHIVES}
				onSelect={setHive}
			/>
		);
	}

	return (
		<InspectionForm
			hive={hive}
			onBack={() => setHive(null)}
		/>
	);
}
