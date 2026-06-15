import { scheduleVariablesPurge } from '../src/schedule-variables-purge';

describe('scheduleVariablesPurge', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-06-15T12:00:00Z'));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('purges at most once per interval', async () => {
		process.env.GRAFANA_TABLE = 'idempiere_log';
		const query = jest.fn().mockResolvedValue({ rowCount: 1 });
		const grafana = { query } as any;
		const purge = scheduleVariablesPurge(grafana, 90, 60 * 60 * 1000);

		purge();
		await Promise.resolve();
		purge();
		await Promise.resolve();

		expect(query).toHaveBeenCalledTimes(1);
	});

	it('purges again after the interval has passed', async () => {
		jest.useRealTimers();
		process.env.GRAFANA_TABLE = 'idempiere_log';
		const query = jest.fn().mockResolvedValue({ rowCount: 1 });
		const grafana = { query } as any;
		const purge = scheduleVariablesPurge(grafana, 90, 10);

		purge();
		await new Promise((resolve) => setTimeout(resolve, 20));
		purge();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(query).toHaveBeenCalledTimes(2);
	});
});
