import { purgeOldVariables } from '../src/purge-old-variables';
import { sensitiveVariableFieldSqlPatterns } from '../src/variables-contain-pii';

describe('purgeOldVariables', () => {
	it('clears variables on records older than the retention period', async () => {
		process.env.GRAFANA_TABLE = 'idempiere_log';
		const query = jest.fn().mockResolvedValue({ rowCount: 42 });
		const grafana = { query } as any;

		await purgeOldVariables(grafana, 90);

		expect(query).toHaveBeenCalledWith(
			expect.stringContaining('UPDATE idempiere_log'),
			[90, ...sensitiveVariableFieldSqlPatterns],
		);
		expect(query).toHaveBeenCalledWith(
			expect.stringContaining('SET variables = NULL'),
			[90, ...sensitiveVariableFieldSqlPatterns],
		);
		expect(query).toHaveBeenCalledWith(
			expect.stringContaining("log_time < NOW() - ($1 * INTERVAL '1 day')"),
			[90, ...sensitiveVariableFieldSqlPatterns],
		);
		expect(query).toHaveBeenCalledWith(
			expect.stringContaining("query_type <> 'log'"),
			[90, ...sensitiveVariableFieldSqlPatterns],
		);
	});
});
