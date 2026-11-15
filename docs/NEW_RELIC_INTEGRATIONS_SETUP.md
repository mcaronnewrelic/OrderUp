# New Relic Integrations: nginx and PostgreSQL

How the infrastructure agent monitors nginx and PostgreSQL. It runs on the **EC2 deployment** (installed by `install-orderup.sh`) and in the **full local Docker setup** (`npm run docker:dev:full`, configured by `newrelic-integrations/docker/`).

## What is installed

`cloudformation/install-orderup.sh` installs both packages from New Relic's repository with `dnf`, writes their configuration, and restarts the agent:

| Integration | Package | Configuration written to | What it reads |
|---|---|---|---|
| nginx | `nri-nginx` | `/etc/newrelic-infra/integrations.d/nginx-config.yml` | nginx's status page, `http://127.0.0.1:8080/nginx_status` |
| PostgreSQL | `nri-postgresql` | `/etc/newrelic-infra/integrations.d/postgresql-config.yml` | The `orderup` database, as a read-only `newrelic` user created at install time with a generated password |

Logs are forwarded from `/etc/newrelic-infra/logging.d/logging.yml`. The files in [newrelic-integrations/](../newrelic-integrations/README.md) are reference copies of this configuration.

## What you get in New Relic

- **nginx:** request rate, connections (active, waiting), status-page counters.
- **PostgreSQL:** connections and transactions, query statistics from `pg_stat_statements`, table and index statistics, lock information.
- Everything carries the `environment` and `application: orderup` attributes the agent adds.

## Verify

```bash
# On the instance
sudo systemctl status newrelic-infra
curl -s http://127.0.0.1:8080/nginx_status
/var/db/newrelic-infra/newrelic-integrations/bin/nri-nginx -pretty
/var/db/newrelic-infra/newrelic-integrations/bin/nri-postgresql -pretty
```

Or from your machine: `cloudformation/validate-monitoring.sh -e staging`.

## Troubleshooting

- **Nothing appears for an integration:** check `sudo journalctl -u newrelic-infra -n 100`, then run the integration binary by hand as above to see its error.
- **nginx connection refused:** the status page is open only to localhost and private address ranges; check `curl http://127.0.0.1:8080/nginx_status` and the nginx config in `/etc/nginx/conf.d/orderup.conf`.
- **PostgreSQL authentication errors:** the `newrelic` user's password is generated at install time and written into the integration file. Do not edit the user without updating the file.
- `cloudformation/diagnose-nginx-monitoring.sh` and `diagnose-postgresql-monitoring.sh` check each step of the above.

## Query details and execution plans

The PostgreSQL integration can report which queries are slow, each execution of them, and their execution plans. These are separate event types, with different requirements:

| Event type | What it feeds | Needs |
|---|---|---|
| `PostgresSlowQueries` | The slow-query list | `pg_stat_statements` loaded and created in the database, `ENABLE_QUERY_MONITORING: true`, and the `pg_read_all_stats` role for the user. Queries must take longer than `QUERY_MONITORING_RESPONSE_TIME_THRESHOLD` ms (default 1). |
| `PostgresIndividualQueries` | The "query details" charts | Everything above, **plus the `pg_stat_monitor` extension**. |
| `PostgresExecutionPlanMetrics` | The execution plan charts | The same: the integration prints `Extension 'pg_stat_monitor' is not enabled or unsupported version` without it. |
| `PostgresWaitEvents` | The wait-event charts | `pg_wait_sampling` (preloaded, and created in the database), plus `pg_stat_statements`. Only waits of statements that have a query ID are kept. |
| `PostgresBlockingSessions` | The blocking-session charts | `pg_stat_statements`. Reported only while one session holds a lock another is waiting for, and only if **both** statements have already finished once (the blocker must be idle in its transaction, not in the middle of a statement). No extra extension. |

This app's own queries never wait on anything, so the last two stay empty unless something creates a wait. The [wait-events generator](#generating-wait-events) does.

### Why the AWS charts are empty

Two separate causes, found by running the integration against the local database:

1. **`track_planning` broke slow-query collection (fixed in the scripts).** Both monitoring setup scripts turned on `pg_stat_statements.track_planning`. With it on, `pg_stat_statements` keeps rows whose `calls` is 0, and the integration divides by `calls` when it reads slow queries. It fails with `Error fetching slow-running queries: pq: division by zero (22012)` and sends **no** query events at all. The error is only in the agent's log, not in any data. `db/scripts/01-setup-monitoring-config.sh` and `cloudformation/install-orderup.sh` now set it to `off`, which covers new databases. An **existing** database needs the change applied by hand:

   ```bash
   # On the EC2 instance (Session Manager or SSH), or: docker exec -it orderup-db sh
   sudo -u postgres psql -d orderup      -c "ALTER SYSTEM SET pg_stat_statements.track_planning = off"      -c "SELECT pg_reload_conf()"      -c "SELECT pg_stat_statements_reset()"
   ```

   No restart is needed. Within a minute or two, `SELECT count(*) FROM PostgresSlowQueries SINCE 10 minutes ago` in New Relic should return rows. (Locally, with the stock database image, this was verified: before, 0 slow-query events and the division-by-zero error; after, 40 events in ten minutes.)

2. **`pg_stat_monitor` is not installed on EC2 (not fixed there).** The EC2 PostgreSQL package does not include Percona's `pg_stat_monitor`, so on AWS `PostgresIndividualQueries` and `PostgresExecutionPlanMetrics` stay empty, and the "query details" and "execution plans" charts with them. The local Docker database now has it (see below), which shows what the instance needs: build or package the extension for the instance's PostgreSQL 16, add it to `shared_preload_libraries` next to `pg_stat_statements`, **restart PostgreSQL**, run `CREATE EXTENSION pg_stat_monitor` in the `orderup` database, and turn on `pg_stat_monitor.pgsm_enable_query_plan`. That has not been done on EC2, and the install script does not do it yet. Even then, only queries slower than `QUERY_MONITORING_RESPONSE_TIME_THRESHOLD` ms (default 1) become individual-query and plan events, and this app's queries are all faster, so the charts fill only when something slow runs (for example an armed "It's not checkout" investigation) unless you lower the threshold.

To check from New Relic which events a host sends:

```
SELECT count(*) FROM PostgresSlowQueries, PostgresIndividualQueries, PostgresExecutionPlanMetrics, PostgresWaitEvents FACET eventType(), hostname SINCE 30 minutes ago
```

To see the integration's own errors, run it by hand (this prints nothing on stdout but the data, and errors on stderr):

```bash
# Local: from the agent container
docker exec orderup-infra sh -c 'HOSTNAME=db PORT=5432 USERNAME=$DB_USER PASSWORD=$DB_PASSWORD DATABASE=$DB_NAME SSL_MODE=disable COLLECTION_LIST=ALL METRICS=true ENABLE_QUERY_MONITORING=true /var/db/newrelic-infra/newrelic-integrations/bin/nri-postgresql >/dev/null'
```

## Locally

`npm run docker:dev:full` starts the `newrelic/infrastructure-bundle` image, which contains the agent and the nginx and PostgreSQL integrations, on the compose network. Two files in [newrelic-integrations/docker/](../newrelic-integrations/docker/) are mounted into it:

- `nginx-config.yml` reads `http://nginx/nginx_status` (the dev nginx config allows private address ranges on that path). Inventory is off, because nginx's config file is in another container.
- `postgresql-config.yml` connects to the `db` service as the database's own user. The agent fills in `{{DB_USER}}`, `{{DB_PASSWORD}}` and `{{DB_NAME}}` from its environment, which compose sets from `.env`. That user is a superuser in this local container; the EC2 setup uses a read-only `newrelic` user instead.

In New Relic you get `NginxSample`, `PostgresqlInstanceSample`, `PostgresqlDatabaseSample`, `PostgresSlowQueries`, `PostgresIndividualQueries` and `PostgresExecutionPlanMetrics`, labelled `env = local-docker`. The query-details and execution-plan charts work: the local database image is built with `pg_stat_monitor` (compiled from Percona's source in `docker/postgres-monitoring.dockerfile`, which needs internet access on the first build), `docker-compose.arm64.yml` preloads it alongside `pg_stat_statements`, the init script creates it and turns on plan capture, and `postgresql-config.yml` sets `QUERY_MONITORING_RESPONSE_TIME_THRESHOLD: 0` so that ordinary traffic produces events (the app's queries all run in under a millisecond).

The integration also monitors itself, so its own queries appear among the top rows. Wait events work too: the image also builds `pg_wait_sampling` (Postgres Professional, v1.1.11), which `docker-compose.arm64.yml` preloads last, after `pg_stat_statements` and `pg_stat_monitor`, as its README asks. The init script creates it.

**An existing local database volume** does not run the init scripts again, so after rebuilding the image (`docker-compose --env-file .env -f docker/docker-compose.arm64.yml up -d --build db`) run these once. The extensions are preloaded at start-up, so recreating the container is what loads them:

```bash
docker exec orderup-db psql -U orderup_user -d orderup -c "CREATE EXTENSION IF NOT EXISTS pg_stat_monitor" -c "CREATE EXTENSION IF NOT EXISTS pg_wait_sampling"
docker exec orderup-db psql -U orderup_user -d orderup -c "ALTER SYSTEM SET pg_stat_monitor.pgsm_enable_query_plan = on" -c "SELECT pg_reload_conf()"
```

The app keeps one database connection, so restart it (`docker restart orderup-app`) after the database restarts.

If an integration does not appear, `docker logs orderup-infra` shows `Integration health check finished with success` for each one that started, or `integration exited with error state`. The usual causes are a missing `DB_PASSWORD` in `.env`, and `INVENTORY: true` on the nginx integration (it tries to read a local `/etc/nginx/nginx.conf`).

## Generating wait events

A scheduled generator (`server/demo-wait-events.js`) makes the wait-event and blocking-session charts show something. While it is armed, every few minutes it runs a short **episode** on a scratch table of its own, `demo_wait_events`. It never touches orders or customers, so no visitor is ever affected.

An episode, about 20 seconds long:

1. Runs the contended `UPDATE` once, on its own. The integration only reports a blocking session whose statement it has already seen finish.
2. A **blocker** session begins a transaction, runs the `UPDATE`, and then sits idle in the transaction.
3. Two **waiters** run the same `UPDATE` and wait for the row lock (`Lock:transactionid` and `Lock:tuple`).
4. A **sleeper** runs `pg_sleep` (`Timeout:PgSleep`).
5. The blocker commits, everything finishes, and every session closes. The sessions are named `orderup-wait-demo-*`, and the blocker has an idle-in-transaction timeout, so a crash cannot leave a lock behind.

Arm it from the **Instructor** page (`/instructor`, "Database wait events"): pick how often, then **Arm**. **Run one episode now** runs a single one without arming the schedule, and **Disarm** and **Clear override** work like the other controls. The choice survives a restart. Or arm it from the environment: `DEMO_DB_WAIT_EVENTS=1`, with `DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS` (default 180, 30 to 3600) and `DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS` (default 20, 5 to 60). The same thing over HTTP: `GET`, `POST {"mode":"on","intervalSeconds":60}`, `POST {"mode":"off"}`, `POST {"action":"run-now"}` and `DELETE` on `/api/demo/wait-events`. It only runs when the server uses the database, and each episode records a `DemoWaitEpisode` event so you can line the episodes up against the waits they caused.

In New Relic, give it a few minutes and look for:

```
SELECT count(*) FROM PostgresWaitEvents FACET wait_event_name, wait_category SINCE 30 minutes ago
SELECT blocked_query, blocking_query FROM PostgresBlockingSessions SINCE 30 minutes ago
SELECT * FROM DemoWaitEpisode SINCE 30 minutes ago
```

The integration takes a snapshot every 30 seconds and an episode lasts about 20, so not every episode is caught; with an episode every minute or two there is a steady trickle of data. On AWS the generator works the same way, but wait events also need `pg_wait_sampling` on the instance, which is not installed there yet.
