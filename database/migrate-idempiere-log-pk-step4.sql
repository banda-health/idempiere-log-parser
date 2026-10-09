-- Step 4 of migrate-idempiere-log-pk.sql — short ACCESS EXCLUSIVE.
-- The unique index on event_hash from step 3 stays live while the old
-- composite PK is dropped. Keep the hash trigger.

BEGIN;
SET LOCAL lock_timeout = '1s';

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_pk;

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_pk
	PRIMARY KEY USING INDEX idempiere_log_event_hash_uidx;

COMMIT;
