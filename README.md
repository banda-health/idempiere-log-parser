# idempiere-log-parser
This is mean to be run as a service that processes iDempiere log files to parse out GraphQL requests and log those requests, along with specified parameters, to our logging database for analytics.

This was designed on Node 22 and the associated `npm` version.

## Setup
To install this on a new server, do the same you'd do for development. So, install the code, then run
```
npm install
```

## Configuration
Copy the `.env.example` file and rename it to `.env` and set the properties.

New Grafana installs create `idempiere_log` with `PRIMARY KEY (event_hash)`
and a non-unique index on `(log_time, query_type, query_name)`
(`database/initdb.sql`). There is no surrogate `id` and no unique on the
triple.

A BEFORE INSERT/UPDATE trigger sets `event_hash` to `md5` of the inserted
fields (time, type, name, duration, payload, record UU, error data, user
context). The parser does not send a hash. Distinct statements get distinct
hashes. A replay of the same fields hits `ON CONFLICT (event_hash) DO NOTHING`.

The triple index is for dashboard filters only.

Production still has `PRIMARY KEY (log_time, query_type, query_name)` until
ops finish the online migration (do **not** add a generated `STORED` column —
that rewrites the table):

1. `database/migrate-idempiere-log-pk.sql` — nullable `event_hash` + SQL hash trigger
2. `database/migrate-idempiere-log-pk-backfill.sql` then `CALL idempiere_log_backfill_event_hash_all(1);` and one `VACUUM idempiere_log` (see `migrate-idempiere-log-pk-backfill-loop.sql`)
3. `database/migrate-idempiere-log-pk-step3.sql` — `NOT NULL` / unique on `event_hash` / dashboard index
4. `database/migrate-idempiere-log-pk-step4.sql` — drop the composite PK, attach `PRIMARY KEY (event_hash)`

Historical rows use the same SQL hash as new inserts, so a replay after
backfill is skipped.

Grafana alert SQL: `grafana-error-alerts.sql`.

## Set up a system process to run this
Do the following:
1. In `/lib/systemd/system/idempiere-log-parser.service`, create the `idempiere-log-parser.service` and populate it with the same contents as that file in this repository.
2. Reload the daemon by `sudo systemctl daemon-reload`.
3. Ensure SystemD will automatically start the service by running `sudo systemctl enable data-integrity-alerter`.
3. Start the service `sudo systemctl start data-integrity-alerter`.
4. (Optional) Check the service status `sudo systemctl status idempiere-log-parser`.
