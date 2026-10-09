-- Step 3 of migrate-idempiere-log-pk.sql — run each statement separately.
-- VALIDATE and CREATE INDEX CONCURRENTLY take a SHARE UPDATE EXCLUSIVE lock
-- (reads and writes continue). SET NOT NULL is catalog-only on PostgreSQL 12+
-- once the CHECK has been validated.
--
-- Unique on (log_time, query_type, query_name) is the dashboard index and
-- the replay gate. Same-ms Log rows are already distinct via extra micros.

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_id_notnull CHECK (id IS NOT NULL) NOT VALID;

ALTER TABLE idempiere_log VALIDATE CONSTRAINT idempiere_log_id_notnull;

ALTER TABLE idempiere_log ALTER COLUMN id SET NOT NULL;

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_id_notnull;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_id_uidx
	ON idempiere_log (id);

-- Built online so step 4 can DROP the old composite PK without a gap.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_natural_key
	ON idempiere_log (log_time, query_type, query_name);
