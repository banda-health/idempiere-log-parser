\c grafana;

CREATE TABLE idempiere_log
(
	log_time     timestamp NOT NULL,
	query_type   varchar   NOT NULL,
	query_name   varchar   NOT NULL,
	duration     numeric   NOT NULL,
	variables    JSONB,
	user_context JSONB,
	ad_client_id numeric,
	ad_org_id    numeric,
	record_uu    uuid,
	ad_user_id   numeric,
	error_data   text,
	CONSTRAINT idempiere_log_pk PRIMARY KEY (log_time, query_type, query_name)
);

CREATE INDEX idempiere_log_time ON idempiere_log USING brin (log_time);

CREATE TABLE idempiere_log_query_name
(
	name varchar NOT NULL,
	CONSTRAINT idempiere_log_query_name_pk PRIMARY KEY (name)
);

CREATE TABLE idempiere_log_client
(
	client_id numeric NOT NULL,
	CONSTRAINT idempiere_log_client_pk PRIMARY KEY (client_id)
);

CREATE TABLE idempiere_log_event_type
(
	name varchar NOT NULL,
	CONSTRAINT idempiere_log_event_type_pk PRIMARY KEY (name)
);

CREATE TABLE idempiere_log_page
(
	pathname varchar NOT NULL,
	CONSTRAINT idempiere_log_page_pk PRIMARY KEY (pathname)
);

CREATE TABLE idempiere_log_app_version
(
	version varchar NOT NULL,
	CONSTRAINT idempiere_log_app_version_pk PRIMARY KEY (version)
);

