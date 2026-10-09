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

New Grafana installs create `idempiere_log` with `PRIMARY KEY (id)`,
`UNIQUE (event_hash)`, and a non-unique index on
`(log_time, query_type, query_name)` (`database/initdb.sql`).

`event_hash` is `sha256` of the inserted fields (time, type, name, duration,
payload, record UU, error data, user context). Distinct statements get
distinct hashes, so they never collide — including two `Log` or two
`GetPatient` rows in the same millisecond. The same line hashes the same
way, so `ON CONFLICT (event_hash) DO NOTHING` skips a replay.

The triple index is for dashboard filters only. Do not make it unique.

Production still has `PRIMARY KEY (log_time, query_type, query_name)` until
ops finish the online migration (do **not** `ADD COLUMN id BIGSERIAL`).
Deploy the parser that writes `event_hash` **after** step 4:

1. `database/migrate-idempiere-log-pk.sql` — nullable `id` + `event_hash` + trigger
2. `database/migrate-idempiere-log-pk-backfill.sql` — batched `UPDATE` + `VACUUM`
3. `database/migrate-idempiere-log-pk-step3.sql` — `NOT NULL` / unique on `id` and `event_hash` / dashboard index
4. `database/migrate-idempiere-log-pk-step4.sql` — drop the composite PK, attach `PRIMARY KEY (id)` and `UNIQUE (event_hash)`

Historical rows backfilled in step 2 hash from `id`, so replaying a file that
was ingested before `event_hash` existed can insert those lines again.

Grafana alert SQL: `grafana-error-alerts.sql`.

## Set up a system process to run this
Do the following:
1. In `/lib/systemd/system/idempiere-log-parser.service`, create the `idempiere-log-parser.service` and populate it with the same contents as that file in this repository.
2. Reload the daemon by `sudo systemctl daemon-reload`.
3. Ensure SystemD will automatically start the service by running `sudo systemctl enable data-integrity-alerter`.
3. Start the service `sudo systemctl start data-integrity-alerter`.
4. (Optional) Check the service status `sudo systemctl status idempiere-log-parser`.
