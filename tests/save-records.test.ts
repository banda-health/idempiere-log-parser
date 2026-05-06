import { saveRecords } from '../src/save-records';
import { IdempiereLog } from '../src/process-log-line';

describe('saveRecords', () => {
	it('sends query name insert statement with ON CONFLICT DO NOTHING', async () => {
		process.env.GRAFANA_TABLE = 'idempiere_log';
		const query = jest.fn().mockResolvedValue({});
		const grafana = { query } as any;

		const record: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'query',
			transactionName: 'getPatient',
			duration: 14,
			variables: '{"id":"123"}',
			recordUU: 'ef443334-83d4-42f4-b02a-5540c5a50d4d',
		};

		await saveRecords(grafana, [record]);

		expect(query).toHaveBeenCalledTimes(2);
		expect(query).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('insert into idempiere_log_query_name (name) VALUES($1) ON CONFLICT DO NOTHING'),
			['getPatient'],
		);
	});
});
