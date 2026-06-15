import pg from 'pg';
import { sensitiveVariableFieldSqlPatterns } from './variables-contain-pii';

export const purgeOldVariables = (grafana: pg.Pool, retentionDays: number) => {
	const logWithPiiConditions = sensitiveVariableFieldSqlPatterns
		.map((_, index) => `variables::text ~* $${index + 2}`)
		.join(' OR ');

	return grafana.query(
		`UPDATE ${process.env.GRAFANA_TABLE!}
		 SET variables = NULL
		 WHERE log_time < NOW() - ($1 * INTERVAL '1 day')
		   AND variables IS NOT NULL
		   AND (
		     query_type <> 'log'
		     OR ${logWithPiiConditions}
		   )`,
		[retentionDays, ...sensitiveVariableFieldSqlPatterns],
	);
};
