# Dev Container Setup

OrderUp ships a VS Code dev container ([.devcontainer/](../../.devcontainer/)) so you can work without installing Node, Python or Docker tooling yourself.

## What you get

`devcontainer.json` builds from the `javascript-node:24-bookworm` image and adds Python (for Locust), Git, zsh, and Docker access through **docker-outside-of-docker**: the container uses your host's Docker engine rather than running its own. After the container is created it runs `npm install` in the repository root and in `angular-app/`. Ports 3000, 3001, 80, 8089 and 5432 are forwarded to your machine.

## Start

1. Open the folder in VS Code and choose **Reopen in Container**.
2. Create your environment file and fill in at least `DB_PASSWORD` and `NEW_RELIC_LICENSE_KEY`:
   ```bash
   npm run setup:env
   ```
3. Build the website and start the simple Docker setup:
   ```bash
   npm run build:angular
   npm run docker:dev:simple
   ```
4. Open http://localhost.

The Docker setups themselves are explained in the [Docker Development Guide](../../DOCKER_DEVELOPMENT_GUIDE.md). The two compose files in use are `docker/docker-compose.dev-simple.yml` and `docker/docker-compose.arm64.yml`.

You can also run the app without Docker inside the dev container (`npm run dev`). Without database settings it serves the restaurants from `server/data/restaurants.json` and keeps no order history in a database.

## The "Mounts denied" problem

With docker-outside-of-docker, a bind mount such as `../dist:/dist` is resolved by the Docker engine on your **host**, but the compose file is read inside the container, where the workspace is under `/workspaces/`. The host has no such folder, so Docker answers `Mounts denied: The path /workspaces/... is not shared from the host`.

Options, simplest first:

- **Run the Docker commands from a terminal on your machine**, not inside the dev container. Use the dev container for editing, building Angular and running tests, and your host terminal for `npm run docker:dev:simple`.
- **Skip the mounts.** The simple setup mounts `dist/` into the app, and the full setup mounts the host filesystem into the infrastructure agent. Remove or comment out those mounts for a dev-container-only run.
- **Use the full setup only on the host.** Its infrastructure agent is privileged and mounts `/`, the Docker socket and `/var/run`, which a dev container cannot grant.

The earlier approach, a separate "devcontainer" compose file with a reduced New Relic agent, is in `docker/archive/docker-compose.devcontainer.yml` and is not maintained.

## Running the tests in the container

```bash
cd angular-app && npm run test:ci     # Angular specs, headless Chrome
node --test server/                    # server tests
```

The Angular tests need Chrome, and the dev container image does not install it. If `ChromeHeadless` is missing, run the tests from your host, where Chrome is installed. See [Testing the front end](../../angular-app/TESTING.md).

## Load testing

`npm run loadtest`, `loadtest:web` and `loadtest:headless` run Locust from a Python virtual environment at `.venv/` against `http://localhost:3000`, so start the app first (the simple Docker setup publishes port 3000). See [Load Testing](../LOAD_TESTING.md). The Docker-based load test setup is in `docker/archive/`.

## Build problems after switching between container and host

`node_modules` installed in the Linux container will not work on a Mac or Windows host (and the reverse): `ng build` fails with "You installed esbuild for another platform". Build where you installed, or run `npm run build:angular:docker` from your host terminal, which builds inside a `node:24` container.

## See also

- [Docker Comprehensive Guide](../troubleshooting/DOCKER_COMPREHENSIVE_GUIDE.md) for Docker troubleshooting
- [Setup Guide](./SETUP_GUIDE.md) for the optional HTTPS development environment
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
