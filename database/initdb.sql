\c grafana;

-- Hash is computed in SQL (trigger) so the parser does not send it.
-- Same inserted fields → same hash → ON CONFLICT (event_hash) skips replay.
CREATE OR REPLACE FUNCTION idempiere_log_event_hash(
	p_log_time timestamp,
	p_query_type varchar,
	p_query_name varchar,
	p_duration numeric,
	p_variables jsonb,
	p_record_uu uuid,
	p_error_data text,
	p_user_context jsonb
) RETURNS text
LANGUAGE sql
AS $$
	SELECT md5(
		coalesce(p_log_time::text, '') || E'\x01' ||
		coalesce(p_query_type, '') || E'\x01' ||
		coalesce(p_query_name, '') || E'\x01' ||
		coalesce(p_duration::text, '0') || E'\x01' ||
		coalesce(p_variables::text, '') || E'\x01' ||
		coalesce(p_record_uu::text, '') || E'\x01' ||
		coalesce(p_error_data, '') || E'\x01' ||
		coalesce(p_user_context::text, '')
	);
$$;

CREATE OR REPLACE FUNCTION idempiere_log_assign_event_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.event_hash := idempiere_log_event_hash(
		NEW.log_time,
		NEW.query_type,
		NEW.query_name,
		NEW.duration,
		NEW.variables,
		NEW.record_uu,
		NEW.error_data,
		NEW.user_context
	);
	RETURN NEW;
END;
$$;

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
	event_hash   varchar(32) NOT NULL,
	CONSTRAINT idempiere_log_pk PRIMARY KEY (event_hash)
);

CREATE TRIGGER idempiere_log_assign_event_hash
	BEFORE INSERT OR UPDATE ON idempiere_log
	FOR EACH ROW
	EXECUTE PROCEDURE idempiere_log_assign_event_hash();

CREATE INDEX idempiere_log_time ON idempiere_log USING brin (log_time);
CREATE INDEX idempiere_log_natural ON idempiere_log (log_time, query_type, query_name);

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
