# New Relic integration files

Reference copies of the configuration the New Relic infrastructure agent uses on the **EC2 deployment**, to monitor nginx and PostgreSQL and to forward logs.

| File | For | Notes |
|---|---|---|
| `nginx-config.yml` | `nri-nginx` | Reads nginx's status page at `http://127.0.0.1:8080/nginx_status`. The access log is JSON, which this integration's log parser cannot read, so log-derived metrics are off; status splits come from the forwarded log attributes instead. |
| `postgres-config.yml` | `nri-postgresql` | Connects to `localhost:5432` as the read-only `newrelic` user, with its password from `NEWRELIC_DB_PASSWORD`. |
| `orderup-logs.yml` | Log forwarding | Tails the PM2 backend logs under `/opt/orderup/logs`, the nginx access and error logs and the PostgreSQL logs. |

## These files are not what runs

`cloudformation/install-orderup.sh` writes the real files on the instance (under `/etc/newrelic-infra/integrations.d/` and `logging.d/`), with the generated `newrelic` database password filled in. Nothing copies these files there, and the local Docker setups do not mount them. If you change the monitoring, change `install-orderup.sh` first and keep these copies in step.

The same is true of the local Docker infrastructure agent in `docker/docker-compose.arm64.yml`: it reports the Docker host and containers, but runs no nginx or PostgreSQL integration, because these configs point at `localhost` and the EC2 `newrelic` user. To monitor the local containers you would need configs that point at the `nginx` and `db` services.

## Checking it on EC2

```bash
sudo systemctl status newrelic-infra
sudo journalctl -u newrelic-infra -n 50
ls /etc/newrelic-infra/integrations.d/
/var/db/newrelic-infra/newrelic-integrations/bin/nri-nginx -pretty
```

`cloudformation/validate-monitoring.sh -e staging` runs these checks for you, and `diagnose-nginx-monitoring.sh` and `diagnose-postgresql-monitoring.sh` dig deeper. See [New Relic Infrastructure Setup](../docs/NEW_RELIC_INFRA_SETUP.md) and [New Relic Integrations](../docs/NEW_RELIC_INTEGRATIONS_SETUP.md).
