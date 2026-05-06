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

	it("doesn't save records with bad query names", async () => {
		process.env.GRAFANA_TABLE = 'idempiere_log';
		const query = jest.fn().mockResolvedValue({});
		const grafana = { query } as any;

		const validRecord: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'query',
			transactionName: 'getPatient',
			duration: 14,
			variables: '{"id":"123"}',
			recordUU: 'ef443334-83d4-42f4-b02a-5540c5a50d4d',
		};
		const badRecord: IdempiereLog = {
			logTime: new Date().toISOString(),
			queryType: 'query',
			transactionName: '   ',
			duration: 5,
			variables: '{"id":"456"}',
			recordUU: '11111111-83d4-42f4-b02a-5540c5a50d4d',
		};

		await saveRecords(grafana, [validRecord, badRecord]);

		expect(query).toHaveBeenCalledTimes(2);
		expect(query).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('insert into idempiere_log_query_name (name) VALUES($1) ON CONFLICT DO NOTHING'),
			['getPatient'],
		);
		expect(query).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining('insert into idempiere_log (log_time,query_type,query_name,duration,variables,record_uu,error_data,user_context) VALUES'),
			expect.arrayContaining(['getPatient']),
		);
		expect(query).toHaveBeenNthCalledWith(
			2,
			expect.any(String),
			expect.not.arrayContaining(['   ']),
		);
	});
});
