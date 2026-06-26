import pg from 'pg';
import { extractLogDimensions } from './extract-log-dimensions';
import { IdempiereLog } from './process-log-line';

const queryNameTable = process.env.GRAFANA_QUERY_NAME_TABLE || 'idempiere_log_query_name';
const clientTable = 'idempiere_log_client';
const eventTypeTable = 'idempiere_log_event_type';
const pageTable = 'idempiere_log_page';
const appVersionTable = 'idempiere_log_app_version';

const insertDistinct = (grafana: pg.Pool, table: string, column: string, values: (string | number)[]) => {
	if (!values.length) {
		return Promise.resolve();
	}

	let variableCounter = 1;
	const valuesStatement = values.map(() => `($${variableCounter++})`).join(',');

	return grafana.query(
		`insert into ${table} (${column}) VALUES${valuesStatement} ON CONFLICT DO NOTHING`,
		values,
	);
};

export const saveRecords = (grafana: pg.Pool, recordsToSave: IdempiereLog[]) => {
	const recordsWithValidQueryNames = recordsToSave.filter((record) => record.transactionName?.trim());
	if (!recordsWithValidQueryNames.length) {
		return Promise.resolve([]);
	}

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

	const valuesStatement = recordsWithValidQueryNames
		.map(() => '(' + fieldsToSave.map(() => '$' + variableCounter++).join(',') + ')')
		.join(',');

	const queryNames = [...new Set(recordsWithValidQueryNames.map((record) => record.transactionName.trim()))];
	const { appVersions, clientIds, eventTypes, pathnames } = extractLogDimensions(recordsWithValidQueryNames);

	return Promise.all([
		insertDistinct(grafana, queryNameTable, 'name', queryNames),
		insertDistinct(grafana, clientTable, 'client_id', clientIds),
		insertDistinct(grafana, eventTypeTable, 'name', eventTypes),
		insertDistinct(grafana, pageTable, 'pathname', pathnames),
		insertDistinct(grafana, appVersionTable, 'version', appVersions),
		grafana.query(
			`insert into ${process.env.GRAFANA_TABLE!} (${fieldsToSave.join(',')}) VALUES` +
				valuesStatement +
				' ON CONFLICT DO NOTHING',
			recordsWithValidQueryNames.flatMap((record) => [
				record.logTime,
				record.queryType,
				record.transactionName.trim(),
				record.duration || 0,
				record.variables,
				record.recordUU,
				record.errorData || null,
				record.userContext || null,
			]),
		),
	]);
};
