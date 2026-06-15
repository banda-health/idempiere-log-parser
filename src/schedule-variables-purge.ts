import pg from 'pg';
import { purgeOldVariables } from './purge-old-variables';

const defaultPurgeIntervalMs = 60 * 60 * 1000;

export const scheduleVariablesPurge = (
	grafana: pg.Pool,
	retentionDays: number,
	purgeIntervalMs = defaultPurgeIntervalMs,
) => {
	let lastPurgeTime = 0;
	let isPurgeInProcess = false;

	return () => {
		if (isPurgeInProcess || Date.now() - lastPurgeTime < purgeIntervalMs) {
			return;
		}

		isPurgeInProcess = true;
		lastPurgeTime = Date.now();

		purgeOldVariables(grafana, retentionDays)
			.then((result) => {
				const purgedRowCount = result.rowCount ?? 0;
				console.log(
					`variables purge completed: cleared variables on ${purgedRowCount} log records older than ${retentionDays} days`,
				);
			})
			.catch((error) => {
				console.log('error purging old variables: ' + error);
			})
			.finally(() => {
				isPurgeInProcess = false;
			});
	};
};
