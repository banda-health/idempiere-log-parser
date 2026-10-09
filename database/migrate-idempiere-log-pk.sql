-- Manual ops script. The parser does NOT run this on startup.
-- Production already uses PRIMARY KEY (log_time, query_type, query_name).
-- Same-millisecond frontend Log rows work without this change because the
-- parser writes extra microseconds on log_time.
--
-- Run only if you want a surrogate id PK (new Grafana installs get this from
-- initdb.sql). Duplicate natural keys will abort the unique-constraint add.

ALTER TABLE idempiere_log ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE idempiere_log DROP CONSTRAINT IF EXISTS idempiere_log_pk;
ALTER TABLE idempiere_log ADD CONSTRAINT idempiere_log_natural_key UNIQUE (log_time, query_type, query_name);
ALTER TABLE idempiere_log ADD CONSTRAINT idempiere_log_pk PRIMARY KEY (id);
