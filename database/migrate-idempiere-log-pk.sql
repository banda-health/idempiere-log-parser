-- Online surrogate-PK migration for an existing idempiere_log that still has
-- PRIMARY KEY (log_time, query_type, query_name).
--
-- Replaces the composite PRIMARY KEY with a surrogate id PK and keeps
-- UNIQUE (log_time, query_type, query_name) as the dashboard / replay key.
-- Same-ms frontend Log rows stay unique via extra microseconds on log_time.
--
-- Do NOT use `ALTER TABLE idempiere_log ADD COLUMN id BIGSERIAL`.
-- BIGSERIAL is bigint NOT NULL DEFAULT nextval(...). A volatile default
-- rewrites every row under ACCESS EXCLUSIVE, then ADD UNIQUE / ADD PRIMARY
-- KEY builds indexes under the same lock. On millions of JSONB rows that is
-- minutes to hours of blocked parser inserts and Grafana queries.
--
-- Follow Laurenz Albe's int→bigint recipe (Cybertec, 2026), adapted to *add*
-- a bigint id rather than widen an existing integer PK:
-- https://www.cybertec-postgresql.com/en/integer-overflow-in-sequence-generated-primary-keys/
--
--   1. This file — nullable column + trigger (metadata, lock_timeout 1s)
--   2. migrate-idempiere-log-pk-backfill.sql — batched UPDATE + VACUUM (online)
--   3. migrate-idempiere-log-pk-step3.sql — NOT VALID / VALIDATE / CONCURRENTLY
--   4. migrate-idempiere-log-pk-step4.sql — attach PK (id) + UNIQUE natural key
--
-- CREATE INDEX CONCURRENTLY and VACUUM cannot run inside a transaction.
-- No foreign keys reference idempiere_log today. If that changes, drop them
-- before step 4 and recreate NOT VALID + VALIDATE afterward.

BEGIN;
SET LOCAL lock_timeout = '1s';

ALTER TABLE idempiere_log ADD COLUMN IF NOT EXISTS id bigint;

CREATE SEQUENCE IF NOT EXISTS idempiere_log_id_seq;

CREATE OR REPLACE FUNCTION idempiere_log_assign_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id IS NULL THEN
		NEW.id := nextval('idempiere_log_id_seq');
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
