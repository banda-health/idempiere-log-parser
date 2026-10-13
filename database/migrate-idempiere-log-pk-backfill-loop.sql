-- Paste into the same psql session after the batch function exists
-- (\i database/migrate-idempiere-log-pk-backfill.sql).
-- Commits after each window so a cancel keeps finished days.
-- VACUUM afterward (cannot run inside CALL).

-- Walks log_time ranges (not min(null) each day). Recreate the procedure
-- from migrate-idempiere-log-pk-backfill.sql if this CALL is still slow.
CALL idempiere_log_backfill_event_hash_all(1);

-- VACUUM idempiere_log;
