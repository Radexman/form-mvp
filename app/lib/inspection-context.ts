'use server';

import apiaryProfile from '@/apiary.json';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export interface InspectionMeta {
	apiary_name: string;
	beekeeper_name: string;
	veterinary_number: string;
	hive_number: string;
	inspection_number: string;
	inspection_date: string;
}

export interface InspectionWeather {
	temp: number;
	humidity: number;
	wind: number;
	precipitation: number;
	cloud_cover: number;
	weather_code: number;
}

export interface InspectionContext {
	meta: InspectionMeta;
	weather: InspectionWeather | null;
}

interface OpenMeteoCurrent {
	temperature_2m: number;
	relative_humidity_2m: number;
	weather_code: number;
	wind_speed_10m: number;
	precipitation: number;
	cloud_cover: number;
}

async function getWeather(lat: number, lon: number): Promise<InspectionWeather | null> {
	const params = new URLSearchParams({
		latitude: String(lat),
		longitude: String(lon),
		current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,cloud_cover',
		timezone: 'auto',
	});

	try {
		const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
			cache: 'no-store',
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			console.warn(`Open-Meteo responded ${response.status} — skipping weather.`);
			return null;
		}

		const current = (await response.json()).current as OpenMeteoCurrent;
		return {
			temp: Math.round(current.temperature_2m),
			humidity: current.relative_humidity_2m,
			wind: Math.round(current.wind_speed_10m),
			precipitation: current.precipitation,
			cloud_cover: current.cloud_cover,
			weather_code: current.weather_code,
		};
	} catch (error) {
		console.warn('Could not fetch weather from Open-Meteo — skipping.', error);
		return null;
	}
}

export interface InspectionMetaOverrides {
	hive_number?: string | number;
	inspection_number?: string | number;
}

export async function getInspectionContext(overrides: InspectionMetaOverrides = {}): Promise<InspectionContext> {
	const meta: InspectionMeta = {
		apiary_name: apiaryProfile.apiary_name,
		beekeeper_name: apiaryProfile.beekeeper_name,
		veterinary_number: apiaryProfile.veterinary_number,
		hive_number: String(overrides.hive_number ?? apiaryProfile.hive_number),
		inspection_number: String(overrides.inspection_number ?? apiaryProfile.inspection_number),
		inspection_date: new Date().toISOString().slice(0, 10),
	};

	const { lat, lon } = apiaryProfile.location;
	const weather = await getWeather(lat, lon);

	return { meta, weather };
}
