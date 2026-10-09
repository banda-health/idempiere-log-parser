-- Online migration: surrogate id PK + event_hash unique + dashboard index.
-- Existing production tables have PRIMARY KEY (log_time, query_type, query_name).
-- That unique drops distinct same-millisecond rows. event_hash is the replay
-- gate; (log_time, query_type, query_name) stays as a non-unique index.
--
-- Do NOT use `ALTER TABLE idempiere_log ADD COLUMN id BIGSERIAL`.
-- BIGSERIAL rewrites every row under ACCESS EXCLUSIVE.
--
--   1. This file — nullable id + event_hash + insert trigger
--   2. migrate-idempiere-log-pk-backfill.sql — batched UPDATE + VACUUM
--   3. migrate-idempiere-log-pk-step3.sql — NOT VALID / VALIDATE / CONCURRENTLY
--   4. migrate-idempiere-log-pk-step4.sql — drop composite PK, attach PK (id)
--      and UNIQUE (event_hash)
--
-- Deploy the parser that writes event_hash after step 4. CREATE INDEX
-- CONCURRENTLY and VACUUM cannot run inside a transaction.

BEGIN;
SET LOCAL lock_timeout = '1s';

ALTER TABLE idempiere_log ADD COLUMN IF NOT EXISTS id bigint;
ALTER TABLE idempiere_log ADD COLUMN IF NOT EXISTS event_hash varchar(64);

CREATE SEQUENCE IF NOT EXISTS idempiere_log_id_seq;

CREATE OR REPLACE FUNCTION idempiere_log_assign_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id IS NULL THEN
		NEW.id := nextval('idempiere_log_id_seq');
	END IF;
	IF NEW.event_hash IS NULL THEN
		NEW.event_hash := md5(NEW.id::text);
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS idempiere_log_assign_id ON idempiere_log;
CREATE TRIGGER idempiere_log_assign_id
	BEFORE INSERT OR UPDATE ON idempiere_log
	FOR EACH ROW
	EXECUTE PROCEDURE idempiere_log_assign_id();

COMMIT;
