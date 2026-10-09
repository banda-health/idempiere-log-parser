-- Step 3 of migrate-idempiere-log-pk.sql — run each statement separately.
-- VALIDATE and CREATE INDEX CONCURRENTLY take a SHARE UPDATE EXCLUSIVE lock
-- (reads and writes continue). SET NOT NULL is catalog-only on PostgreSQL 12+
-- once the CHECK has been validated.
--
-- Do not create a unique index on (log_time, query_type, query_name).
-- That unique is what drops same-millisecond frontend Log rows.

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_id_notnull CHECK (id IS NOT NULL) NOT VALID;

ALTER TABLE idempiere_log VALIDATE CONSTRAINT idempiere_log_id_notnull;

ALTER TABLE idempiere_log ALTER COLUMN id SET NOT NULL;

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_id_notnull;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_id_uidx
	ON idempiere_log (id);
