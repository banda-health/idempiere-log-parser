\c grafana;

CREATE UNLOGGED TABLE idempiere_log
(
	log_time     timestamp NOT NULL,
	query_type   varchar   NOT NULL,
	query_name   varchar   NOT NULL,
	duration     numeric   NOT NULL,
	variables    JSON,
	ad_client_id numeric,
	ad_org_id    numeric,
	record_uu    uuid,
	ad_user_id   numeric,
	CONSTRAINT idempiere_log_pk PRIMARY KEY (log_time, query_type, query_name)
);

CREATE INDEX idempiere_log_time ON idempiere_log USING brin (log_time);
