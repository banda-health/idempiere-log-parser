-- Online migration: replace PRIMARY KEY (log_time, query_type, query_name)
-- with PRIMARY KEY (event_hash). The hash is assigned in SQL (trigger /
-- backfill). There is no surrogate id and no unique on the old triple.
--
-- Do NOT ADD COLUMN event_hash with a generated STORED expression — that
-- rewrites the table under ACCESS EXCLUSIVE.
--
--   1. This file — nullable event_hash + hash function + insert trigger
--   2. migrate-idempiere-log-pk-backfill.sql — batched UPDATE + VACUUM
--   3. migrate-idempiere-log-pk-step3.sql — NOT NULL / unique index / dashboard index
--   4. migrate-idempiere-log-pk-step4.sql — drop composite PK, attach PK (event_hash)
--
-- Keep the trigger after step 4. CREATE INDEX CONCURRENTLY and VACUUM
-- cannot run inside a transaction.

BEGIN;
SET LOCAL lock_timeout = '1s';

ALTER TABLE idempiere_log ADD COLUMN IF NOT EXISTS event_hash varchar(32);

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

DROP TRIGGER IF EXISTS idempiere_log_assign_event_hash ON idempiere_log;
CREATE TRIGGER idempiere_log_assign_event_hash
	BEFORE INSERT OR UPDATE ON idempiere_log
	FOR EACH ROW
	EXECUTE PROCEDURE idempiere_log_assign_event_hash();

COMMIT;
