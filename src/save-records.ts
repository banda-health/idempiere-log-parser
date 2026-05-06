import pg from 'pg';
import { IdempiereLog } from './process-log-line';

const queryNameTable = process.env.GRAFANA_QUERY_NAME_TABLE || 'idempiere_log_query_name';

export const saveRecords = (grafana: pg.Pool, recordsToSave: IdempiereLog[]) => {
	let variableCounter = 1;
	const fieldsToSave = [
		'log_time',
		'query_type',
		'query_name',
		'duration',
		'variables',
		'record_uu',
		'error_data',
		'user_context',
	];

	const valuesStatement = recordsToSave
		.map(() => '(' + fieldsToSave.map(() => '$' + variableCounter++).join(',') + ')')
		.join(',');

	const queryNames = [...new Set(recordsToSave.map((record) => record.transactionName))];
	let queryNameCounter = 1;
	const queryNameValuesStatement = queryNames.map(() => `($${queryNameCounter++})`).join(',');
	const saveQueryNamesPromise = queryNames.length
		? grafana.query(
				`insert into ${queryNameTable} (name) VALUES` +
					queryNameValuesStatement +
					' ON CONFLICT DO NOTHING',
				queryNames,
			)
		: Promise.resolve();

	return Promise.all([
		saveQueryNamesPromise,
		grafana.query(
			`insert into ${process.env.GRAFANA_TABLE!} (${fieldsToSave.join(',')}) VALUES` +
				valuesStatement +
				' ON CONFLICT DO NOTHING',
			recordsToSave.flatMap((record) => [
				record.logTime,
				record.queryType,
				record.transactionName,
				record.duration || 0,
				record.variables,
				record.recordUU,
				record.errorData || null,
				record.userContext || null,
			]),
		),
	]);
};
