-- Step 3 of migrate-idempiere-log-pk.sql — run each statement separately.
-- VALIDATE and CREATE INDEX CONCURRENTLY take a SHARE UPDATE EXCLUSIVE lock.

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_id_notnull CHECK (id IS NOT NULL) NOT VALID;

ALTER TABLE idempiere_log VALIDATE CONSTRAINT idempiere_log_id_notnull;

ALTER TABLE idempiere_log ALTER COLUMN id SET NOT NULL;

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_id_notnull;

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_event_hash_notnull CHECK (event_hash IS NOT NULL) NOT VALID;

ALTER TABLE idempiere_log VALIDATE CONSTRAINT idempiere_log_event_hash_notnull;

ALTER TABLE idempiere_log ALTER COLUMN event_hash SET NOT NULL;

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_event_hash_notnull;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_id_uidx
	ON idempiere_log (id);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_event_hash_uidx
	ON idempiere_log (event_hash);

-- Dashboard filter index. Not unique — same-ms rows must be allowed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idempiere_log_natural
	ON idempiere_log (log_time, query_type, query_name);
