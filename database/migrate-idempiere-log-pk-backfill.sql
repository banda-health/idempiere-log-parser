-- Step 2 of migrate-idempiere-log-pk.sql
-- Install the batch function, then loop from psql (VACUUM cannot run in a function):
--
--   \i database/migrate-idempiere-log-pk-backfill.sql
--   SELECT idempiere_log_backfill_id_batch(1);
--   VACUUM idempiere_log;
--   -- repeat until 0 rows
--
-- Historical event_hash values include id so the unique can be applied.
-- They will not match a later parser replay of the same file.

CREATE OR REPLACE FUNCTION idempiere_log_backfill_id_batch(p_days numeric DEFAULT 1)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
	v_start timestamp;
	v_end timestamp;
	v_updated bigint;
BEGIN
	IF p_days IS NULL OR p_days <= 0 THEN
		RAISE EXCEPTION 'p_days must be positive';
	END IF;

	SELECT min(log_time) INTO v_start
	FROM idempiere_log
	WHERE id IS NULL OR event_hash IS NULL;

	IF v_start IS NULL THEN
		RETURN 0;
	END IF;

	v_end := v_start + (p_days || ' days')::interval;

	UPDATE idempiere_log
	SET id = COALESCE(id, nextval('idempiere_log_id_seq'))
	WHERE (id IS NULL OR event_hash IS NULL)
	  AND log_time >= v_start
	  AND log_time < v_end;

	UPDATE idempiere_log
	SET event_hash = md5(id::text)
	WHERE event_hash IS NULL
	  AND log_time >= v_start
	  AND log_time < v_end;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated;
END;
$$;
