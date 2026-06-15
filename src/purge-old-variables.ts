import pg from 'pg';

export const purgeOldVariables = (grafana: pg.Pool, retentionDays: number) => {
	return grafana.query(
		`UPDATE ${process.env.GRAFANA_TABLE!}
		 SET variables = NULL
		 WHERE log_time < NOW() - ($1 * INTERVAL '1 day')
		   AND variables IS NOT NULL`,
		[retentionDays],
	);
};
