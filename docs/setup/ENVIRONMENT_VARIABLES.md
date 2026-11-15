# Environment Variables

All configuration comes from environment variables. Locally they live in `.env` in the repository root (copy `.env.example`, or run `npm run setup:env`); `.env` is gitignored. In AWS, the install script writes them into `/opt/orderup/backend/.env` on the instance.

How `.env` is read:

- **Node scripts** (`npm run dev`, `start`) load it with `node --env-file=.env`.
- **Docker** passes it to the containers (`env_file`), and the npm scripts also pass `--env-file .env` to Compose so values such as `DB_PASSWORD` can be filled into the compose files. Containers read the file only when they are **created**, so after editing it run `up -d --force-recreate <service>`.
- **Deployment scripts** (`cloudformation/deploy-production.sh`) read `NEW_RELIC_LICENSE_KEY` from it.

## The application

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` also turns on the database. |
| `PORT` | `3000` | Port the Node app listens on. |
| `DOCKER_COMPOSE` | unset | `true` (set by the simple compose file) turns on the database. The database is also on when `NODE_ENV=production` or `DB_HOST=db`. |

## Database

| Variable | Default | Purpose |
|---|---|---|
| `DB_HOST` | `localhost` | `db` inside the Docker network. |
| `DB_PORT` | `5432` | |
| `DB_NAME` | `orderup` | |
| `DB_USER` | `orderup_user` | |
| `DB_PASSWORD` | none | **Required in Docker.** The database container refuses to start without it, and only applies it when it first creates the volume. |
| `DB_SSL` | `false` | `true` turns TLS on. |
| `DATABASE_URL` | unset | A full connection string; when set, it replaces the individual settings above. |

See the [Database Guide](./DATABASE_GUIDE.md).

## New Relic: APM and the browser

| Variable | Purpose |
|---|---|
| `NEW_RELIC_LICENSE_KEY` | Account license key. Without it the APM agent does not start (`Not starting without license key!`), and the browser agent is not injected. |
| `NEW_RELIC_APP_NAME` | The APM entity name. Defaults to `OrderUp`, which is also what the deployment-marker script searches for. |
| `NEW_RELIC_ENABLED` | `true` makes `server/start.js` load the APM agent first thing. The EC2 install script sets it from whether a key was given. |
| `NEW_RELIC_API_KEY` | A **User** API key (`NRAK-...`). Used for deployment markers, source map upload and dashboard deep links. Server-side only; never sent to the browser. |
| `NEW_RELIC_ACCOUNT_ID` | Powers the "Behind the scenes" buttons. Without it they are hidden. |
| `NEW_RELIC_REGION` | `us` (default) or `eu`. |
| `NEW_RELIC_BROWSER_ENTITY_GUID` | The browser app's entity GUID (`entityGuid` on any `PageAction`). For the "Open Errors Inbox" button. |
| `NEW_RELIC_BROWSER_APP_ID` | The numeric browser `appId`. Needed to upload source maps. |
| `NEW_RELIC_DASHBOARD_GUID` | The OrderUp Overview dashboard that the "your journey" links open. Defaults to the one in account 1352811; change this and the account ID together for another account. |

## New Relic: infrastructure agent (full Docker setup)

| Variable | Default | Purpose |
|---|---|---|
| `NRIA_LICENSE_KEY` | `NEW_RELIC_LICENSE_KEY` | License key for the infrastructure agent. Falls back to `NEW_RELIC_LICENSE_KEY`, so you normally set only that one. |
| `MONITORING_DISPLAY_NAME` | `OrderUp-Infra-Docker-Local` | The host's display name in New Relic. |
| `MONITORING_VERBOSE` | `0` | `1` turns on verbose agent logging. |

## Planned failures and investigations

For the teaching exercises. All optional; see [New Relic Demo Features](../NEW_RELIC_DEMO.md).

| Variable | Purpose |
|---|---|
| `DEMO_FAILING_RESTAURANT` | A restaurant slug whose menu request fails with a 500. |
| `DEMO_FAILING_ORDER_RESTAURANT` | A restaurant slug whose orders always fail. |
| `DEMO_FAILING_ORDER_ITEM` | A menu item slug that makes any order containing it fail. |
| `DEMO_FAILURE_ROTATION` | `off` stops the weekly automatic rotation of planned failures. |
| `DEMO_DB_SLOW_ORDER_QUERY` | Seconds (1 to 10) to slow every order's database work. |
| `DEMO_NGINX_502` | Truthy (anything but empty, `0` or `off`): about half of restaurant and menu requests fail at the proxy. |
| `DEMO_DB_LOCK` | Truthy: lock the orders table for 15 minutes. |
| `DEMO_DB_BIG_ORDERS` | Truthy: seed 200,000 synthetic customers so the phone lookup has to scan. |
| `DEMO_ORDER_POISON` | Truthy: slip a legacy order into the table that freezes the order-status worker. |
| `DEMO_DB_WAIT_EVENTS` | Truthy: run a scheduled database wait episode on a scratch table, so the wait-event and blocking-session charts have data. |
| `DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS` | Seconds between episodes (default 180, 30 to 3600). |
| `DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS` | How long one episode lasts (default 20, 5 to 60). |

Instructors can arm the same things at runtime from the `/instructor` page without touching `.env`.

## Tuning the order-status worker

| Variable | Default | Purpose |
|---|---|---|
| `ORDER_STATUS_POLL_MS` | `20000` | How often the worker looks for orders to advance. |
| `ORDER_STATUS_PENDING_SECONDS` | `45` | Time in "received" before "preparing". |
| `ORDER_STATUS_PREPARING_SECONDS` | `75` | Time in "preparing" before "out for delivery". |
| `ORDER_STATUS_OUT_SECONDS` | `75` | Time out for delivery before "delivered". |

## Docker Compose only

These are read by the compose files, with the defaults shown there: `HTTP_PORT` (simple setup, default 80), `NGINX_PORT` and `NGINX_SSL_PORT` (full setup, 80 and 443), `DB_HEALTH_INTERVAL`, `DB_HEALTH_TIMEOUT`, `DB_HEALTH_RETRIES`, `DB_HEALTH_START_PERIOD`, and `HEALTH_CHECK_INTERVAL`, `HEALTH_CHECK_TIMEOUT`, `HEALTH_CHECK_RETRIES`, `HEALTH_CHECK_START_PERIOD`.

## Deploying to AWS

```bash
# Reads NEW_RELIC_LICENSE_KEY from .env
./cloudformation/deploy-production.sh staging t3.medium my-keypair 'db-password'

# Overrides the key from .env
./cloudformation/deploy-production.sh staging t3.medium my-keypair 'db-password' 'your-license-key'

```

To deploy without New Relic, leave the key out of both places: no fifth argument and no `NEW_RELIC_LICENSE_KEY` in `.env` (an empty fifth argument does not override a key that is in `.env`; the script falls back to it).

The database password is always a command-line argument, never read from `.env`. Without a `.env` file, and without a key argument, the script warns and continues with New Relic off. For GitHub Actions, the same values are stored as repository secrets and variables; see the [Deployment Guide](../deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions).

## Keeping secrets safe

Never commit `.env`. Use `.env.example` as the template others copy. For how to handle keys and passwords, see [Secret Management](./SECRET_MANAGEMENT.md).
