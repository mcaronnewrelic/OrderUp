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
| `postgres-monitoring.dockerfile` | PostgreSQL with the monitoring extensions |
| `newrelic-infra.arm64.dockerfile` | Not used. It built an echo-loop stand-in for the infrastructure agent; the full setup now runs the official `newrelic/infrastructure` image instead. |

The infrastructure agent in the full setup is the official `newrelic/infrastructure` image, pinned to the version the EC2 hosts install. It runs privileged with the host's PID namespace and network, and mounts the host filesystem and the Docker socket read-only, so on Docker Desktop it reports the Docker VM as its host. The nginx and PostgreSQL integration files in `newrelic-integrations/` are written for the EC2 deployment (they point at `localhost` and a `newrelic` database user) and are not mounted locally. See [newrelic-integrations/README.md](../newrelic-integrations/README.md).

## Archive

`archive/` keeps the earlier compose files and Dockerfiles (`docker-compose.yml`, the dev and devcontainer overrides, the load test setup, and the security-hardened Dockerfile). They are not maintained, and documents that refer to them may be out of date.

## Environment

Both compose files read `../.env` for the containers' environment. Compose also needs the file for its own `${...}` substitutions (for example `POSTGRES_PASSWORD=${DB_PASSWORD}`), and it looks for that in this folder, not the root. The npm scripts pass `--env-file .env` for that reason; do the same when you run `docker-compose` yourself. See [Environment Variables](../docs/setup/ENVIRONMENT_VARIABLES.md).
