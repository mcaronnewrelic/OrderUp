# OrderUp Project Structure

Where things are in the repository, and how the backend is put together.

## Root directory

```
orderup/
├── README.md                     # Project overview and quick start
├── DOCKER_DEVELOPMENT_GUIDE.md   # Running the app in Docker
├── PROJECT_STRUCTURE.md          # This file
├── package.json                  # Root dependencies and npm scripts
├── .env.example                  # Environment variable template
├── .gitattributes                # Forces LF line endings for scripts, SQL, nginx and Docker files
├── locustfile.py                 # Locust load test scenarios
│
├── angular-app/                  # Angular 22 frontend (see below)
├── server/                       # Node.js / Express backend (see below)
├── db/                           # Database initialization (init/) and monitoring + utility scripts (scripts/)
├── docker/                       # Compose files and Dockerfiles; archive/ holds retired ones
├── nginx-config/                 # nginx reverse proxy configuration
├── cloudformation/               # AWS template, deploy scripts and the instance install script
├── newrelic/                     # Dashboard, service levels, alerts and workload (NerdGraph)
├── newrelic-integrations/        # Reference copies of the EC2 nginx, PostgreSQL and log configs
├── scripts/                      # Deployment markers, source maps, smoke test; archive/ holds old scripts
├── docs/                         # Documentation (setup/, deployment/, troubleshooting/, archive/)
├── archive/                      # Retired code kept for reference (Terraform)
└── dist/                         # Build output (gitignored)
```

## Frontend: `angular-app/src/app/`

| Folder | What is in it |
|---|---|
| `components/` | One folder per page or widget. Pages: `customer`, `restaurants`, `menu`, `checkout`, `thank-you`, `orders`, `how-it-works`, `who-we-are`, `missions-page`, `investigations-page`, `instructor`. Shared pieces: `header`, `mission-strip`, `customer-card`, `order-steps` (the ordering progress bar), `order-tracker` (the stage tracker), `nr-callout` and `nr-check` (the "Behind the scenes" callouts and checks). |
| `services/` | `cart`, `customer`, `restaurant`, `order`, `order-status` (the WebSocket tracker), `funnel` (ordering funnel events), `newrelic` (browser agent wrapper), `demo-identity` (the `demoCode`), `mission-progress`, `event-types`, `agent-reachability` (can this browser reach New Relic?). |
| `models/` | TypeScript interfaces for restaurants, menu items, carts and orders. |
| `testing/` | Shared stubs and builders for the unit tests. |
| `nr-config.ts` | Settings for the callouts and the instructor controls. |

Unit tests sit beside the code as `*.spec.ts`. See [angular-app/TESTING.md](./angular-app/TESTING.md).

## Backend: `server/`

`server/index.js` exports `createApp(dependencies)`, which returns the configured Express app without listening, registering process handlers, loading restaurant data, synchronizing demo side effects, or starting the order-status worker. It keeps Pino request logging and New Relic instrumentation.

The optional dependency object accepts `storage`, `dbService`, `useDatabase`, `logger`, `newrelic`, `demoFailures`, `demoInvestigations`, `dashboardLinks`, `environment`, `staticDir`, and `angularDistDir`. Defaults use the normal services and process environment; injected storage should already contain its restaurant data.

Route factories live in `server/routes/` and receive their services explicitly:

- `restaurant.js`: mounted at `/api/restaurant`, including the demo socket-failure middleware.
- `order.js`: mounted at `/api`, serving `/order` checkout and `/orders` lookups.
- `demo.js`: mounted at `/api`, serving demo controls, `/nr-config`, and `/dashboard`.
- `simulation.js`: mounted at `/simulate`, with memory-leak state isolated per router instance.

Middleware factories live in `server/middleware/`:

- `request-tracing.js`: request IDs and request/response logging, registered first.
- `angular-fallback.js`: serves Angular's `index.html` for non-API routes and injects the New Relic browser timing header.
- `error-handler.js`: the global error handler, registered last, after all routers and the Angular fallback.

`server/index.js` wires these together with the static file serving and `/health`. Public endpoint URLs remain unchanged.

`server/start.js` is the entry point and owns the lifecycle: `start(PORT, STATIC_DIR, DATA_FILE)` checks the database, loads JSON data when needed, constructs the app, starts the listener and worker, and handles process signals. Tests can import `server/index.js` and call `createApp` without starting the application.

Other modules:

| File | What it does |
|---|---|
| `database.js` | PostgreSQL access (restaurants, menus, orders). |
| `storage.js`, `model.js` | The in-memory fallback used when there is no database. |
| `order-status-worker.js` | Advances orders through their stages on a timer and records `OrderPipelineSample`. |
| `order-status-stream.js` | The WebSocket at `/api/orders/stream`. |
| `demo-failures.js`, `demo-investigations.js` | The planned failures and the instructor-armed investigations. |
| `dashboard-links.js` | Builds the per-visitor dashboard links. |
| `newrelic.js` | APM agent configuration. |
| `*.test.js` | Server tests (`node --test server/`). |

### Live order tracking

`server/order-status-stream.js` is a WebSocket endpoint at `/api/orders/stream`, under `/api/` because the nginx `/api/` location is where upgrades are forwarded. `start.js` attaches it to the HTTP server and wires the worker's `onAdvance` callback to it, so each committed batch pushes the changed orders' new statuses to subscribed browsers. A subscribe first answers with a snapshot read through the app's `getOrderById`.

The stream instruments itself: each connection runs in a background transaction (`OrderStatusStream/connection`), ends with an `OrderStreamSample` event that says who connected, what they saw and how it ended, and sends an `OrderStreamPush` event for every status frame. On the client, `OrderStatusService` owns the channel (REST seed, socket pushes, reconnects, then a polling fallback), persists the tracked order so the header's status pill follows it across pages, and reports its own `order_tracker_*` PageActions. The `order-tracker` component draws the stages on the Thank You page and on every order in My Orders.

## Docker and databases

`docker/` holds the two maintained compose files (`docker-compose.dev-simple.yml`, `docker-compose.arm64.yml`) and their Dockerfiles; see [docker/README.md](./docker/README.md). `db/init/` holds the schema and the restaurant import PostgreSQL runs on first start; `db/scripts/` holds the monitoring setup used by the full setup, plus the import generator. See the [Database Guide](./docs/setup/DATABASE_GUIDE.md).

## Documentation

[docs/README.md](./docs/README.md) is the index. `docs/archive/` holds notes on past changes, not instructions.

## Quick commands

```bash
npm run docker:dev:simple      # run the app (build the website first: npm run build:angular)
npm run docker:status          # what is running
cd angular-app && npm run test:ci    # front-end unit tests
node --test server/            # server tests
./scripts/deploy.sh -h         # local deploy helper options
```
