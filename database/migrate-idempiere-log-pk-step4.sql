-- Step 4 of migrate-idempiere-log-pk.sql — short ACCESS EXCLUSIVE.
-- Retry the whole file if lock_timeout fires (long transaction holding the table).
-- DROP CONSTRAINT on the old composite PK drops its unique index. Do not
-- replace it — same-ms Log rows must be allowed.

BEGIN;
SET LOCAL lock_timeout = '1s';

ALTER TABLE idempiere_log DROP CONSTRAINT idempiere_log_pk;

ALTER TABLE idempiere_log
	ADD CONSTRAINT idempiere_log_pk
	PRIMARY KEY USING INDEX idempiere_log_id_uidx;

ALTER TABLE idempiere_log
	ALTER COLUMN id SET DEFAULT nextval('idempiere_log_id_seq');

ALTER SEQUENCE idempiere_log_id_seq OWNED BY idempiere_log.id;

SELECT setval(
	'idempiere_log_id_seq',
	(SELECT COALESCE(MAX(id), 1) FROM idempiere_log)
);

DROP TRIGGER idempiere_log_assign_id ON idempiere_log;
DROP FUNCTION idempiere_log_assign_id();

COMMIT;
