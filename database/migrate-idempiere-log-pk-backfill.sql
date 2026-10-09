-- Step 2 of migrate-idempiere-log-pk.sql
--
--   \i database/migrate-idempiere-log-pk-backfill.sql
--   CALL idempiere_log_backfill_event_hash_all(1);
--   VACUUM idempiere_log;
--
-- VACUUM cannot run inside the procedure. One vacuum at the end is enough
-- unless dead tuples get large; then cancel, VACUUM, and CALL again.

CREATE OR REPLACE FUNCTION idempiere_log_backfill_event_hash_batch(p_days numeric DEFAULT 1)
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
	WHERE event_hash IS NULL;

	IF v_start IS NULL THEN
		RETURN 0;
	END IF;

	v_end := v_start + (p_days || ' days')::interval;

	UPDATE idempiere_log
	SET event_hash = idempiere_log_event_hash(
		log_time,
		query_type,
		query_name,
		duration,
		variables,
		record_uu,
		error_data,
		user_context
	)
	WHERE event_hash IS NULL
	  AND log_time >= v_start
	  AND log_time < v_end;

	GET DIAGNOSTICS v_updated = ROW_COUNT;
	RETURN v_updated;
END;
$$;

CREATE OR REPLACE PROCEDURE idempiere_log_backfill_event_hash_all(p_days numeric DEFAULT 1)
LANGUAGE plpgsql
AS $$
DECLARE
	v_updated bigint;
	v_batches int := 0;
BEGIN
	LOOP
		v_updated := idempiere_log_backfill_event_hash_batch(p_days);
		v_batches := v_batches + 1;
		RAISE NOTICE '% batch % updated % rows', clock_timestamp(), v_batches, v_updated;
		COMMIT;
		EXIT WHEN v_updated = 0;
	END LOOP;
END;
$$;
