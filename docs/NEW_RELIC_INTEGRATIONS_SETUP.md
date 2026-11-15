# New Relic Integrations: nginx and PostgreSQL

How the infrastructure agent monitors nginx and PostgreSQL. This applies to the **EC2 deployment**. The local Docker setups run the infrastructure agent, but no nginx or PostgreSQL integration (see below).

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

## Locally

`npm run docker:dev:full` starts the official `newrelic/infrastructure` image, which reports the Docker host and the containers. It does not run the nginx or PostgreSQL integrations: the configs in `newrelic-integrations/` point at `localhost` and the EC2 database user, and they are not mounted. To get nginx and PostgreSQL data from the local containers, mount configs that point at `http://nginx/nginx_status` and the `db` service, and give the agent a database user to log in with. See [docker/README.md](../docker/README.md).
