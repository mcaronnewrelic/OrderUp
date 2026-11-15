# Docker files

What each file in this folder is for. To run the app, use [DOCKER_DEVELOPMENT_GUIDE.md](../DOCKER_DEVELOPMENT_GUIDE.md) and its npm scripts. If something breaks, see the [Docker Comprehensive Guide](../docs/troubleshooting/DOCKER_COMPREHENSIVE_GUIDE.md).

## Compose files

| File | Runs | Start it with |
|---|---|---|
| `docker-compose.dev-simple.yml` | App, PostgreSQL 16, nginx | `npm run docker:dev:simple` |
| `docker-compose.arm64.yml` | App, nginx, PostgreSQL with monitoring, the real New Relic infrastructure agent | `npm run docker:dev:full` |

## Dockerfiles

| File | Builds |
|---|---|
| `Dockerfile.simple` | The Node app for the simple setup (server code only; the Angular build is mounted from `dist/`) |
| `Dockerfile.arm64` | The Node app for the full setup, on ARM64 |
| `Dockerfile` | A multi-stage production build of the Node app |
| `nginx.dockerfile` | nginx reverse proxy |
| `postgres-monitoring.dockerfile` | PostgreSQL with the monitoring extensions, including `pg_stat_monitor` and `pg_wait_sampling`, which build stages compile from source (the first build needs internet access and takes a few minutes longer) |
| `newrelic-infra.arm64.dockerfile` | Not used. It built an echo-loop stand-in for the infrastructure agent; the full setup now runs the official `newrelic/infrastructure-bundle` image instead. |

The infrastructure agent in the full setup is the official `newrelic/infrastructure-bundle` image (3.6.3: agent 2.0.2 with the nginx, PostgreSQL and other integrations; the plain `newrelic/infrastructure` image has none). It runs privileged with the host's PID namespace, and mounts the host filesystem and the Docker socket read-only, so on Docker Desktop it reports the Docker VM as its host. It joins the compose network, not the host's, so that it can reach the `nginx` and `db` services by name; the cost is that network-interface metrics describe the container, not the VM. The nginx and PostgreSQL integrations are configured by the files in `newrelic-integrations/docker/`, which are mounted into the container. See [newrelic-integrations/README.md](../newrelic-integrations/README.md).

## Archive

`archive/` keeps the earlier compose files and Dockerfiles (`docker-compose.yml`, the dev and devcontainer overrides, the load test setup, and the security-hardened Dockerfile). They are not maintained, and documents that refer to them may be out of date.

## Environment

Both compose files read `../.env` for the containers' environment. Compose also needs the file for its own `${...}` substitutions (for example `POSTGRES_PASSWORD=${DB_PASSWORD}`), and it looks for that in this folder, not the root. The npm scripts pass `--env-file .env` for that reason; do the same when you run `docker-compose` yourself. See [Environment Variables](../docs/setup/ENVIRONMENT_VARIABLES.md).
