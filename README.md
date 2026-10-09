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

New Grafana installs create `idempiere_log` with a surrogate `id` PK **and**
`UNIQUE (log_time, query_type, query_name)` (`database/initdb.sql`). The unique
is the dashboard index and the replay gate (`ON CONFLICT … DO NOTHING`).

Same-millisecond frontend `Log` rows all share `query_name = 'Log'`. Distinct
payloads get extra microseconds on `log_time` (`sha256(payload) % 1000`) so
they do not collide. The same payload hashes to the same extra micros, so a
replay hits the unique and is skipped.

Production still has the composite PK until ops run the online migration
(do **not** `ADD COLUMN id BIGSERIAL` — that rewrites the table under
`ACCESS EXCLUSIVE`):

1. `database/migrate-idempiere-log-pk.sql` — nullable `id` + insert trigger
2. `database/migrate-idempiere-log-pk-backfill.sql` — batched `UPDATE` + `VACUUM`
3. `database/migrate-idempiere-log-pk-step3.sql` — `NOT VALID` / `VALIDATE` / unique on `id` and the natural key
4. `database/migrate-idempiere-log-pk-step4.sql` — drop the old PK, attach `PRIMARY KEY (id)` and `UNIQUE` on the natural key

Grafana alert SQL: `grafana-error-alerts.sql`.

## Set up a system process to run this
Do the following:
1. In `/lib/systemd/system/idempiere-log-parser.service`, create the `idempiere-log-parser.service` and populate it with the same contents as that file in this repository.
2. Reload the daemon by `sudo systemctl daemon-reload`.
3. Ensure SystemD will automatically start the service by running `sudo systemctl enable data-integrity-alerter`.
3. Start the service `sudo systemctl start data-integrity-alerter`.
4. (Optional) Check the service status `sudo systemctl status idempiere-log-parser`.
