# Database Guide

OrderUp stores restaurants, menus, customers and orders in **PostgreSQL 16**. Locally the database runs in the `db` container of the Docker setups. On EC2 it is installed on the instance by `cloudformation/install-orderup.sh`. If no database is reachable, the server falls back to the restaurants in `server/data/restaurants.json` (orders are then not saved to a database).

## Settings

| Setting | Value |
|---|---|
| Database | `orderup` (`DB_NAME`) |
| User | `orderup_user` (`DB_USER`) |
| Password | `DB_PASSWORD` from `.env` |
| Host | `db` inside the Docker network, `localhost` otherwise (`DB_HOST`) |
| Port | `5432` (`DB_PORT`) |
| SSL | `DB_SSL=true` to turn it on |

`DB_PASSWORD` must be set before the database container is first created, because PostgreSQL only applies it when it initializes an empty volume. The server reads the password from `DB_PASSWORD`; if that is unset it tries `db/password.txt` (optional, gitignored), and as a last resort uses a built-in development fallback. Do not rely on the fallback; see [Security](../SECURITY.md), finding 3.

In the Docker setups the database port is **not published to your machine**. Use the `db:connect` scripts below, or `docker exec`.

## What gets created

`db/init/` holds the two scripts PostgreSQL runs, in order, the **first time** the `db-data` volume is created:

1. `01-init-schema.sql` creates the tables and indexes: `restaurants`, `menu_items`, `customers`, `orders` and `order_items`. An order's `status` starts as `pending`; the order-status worker then advances it through `preparing` and `out_for_delivery` to `delivered`.
2. `02-import-restaurants-uuid.sql` loads the 39 restaurants and their menus. It is generated from `server/data/restaurants.json` and **empties the tables before loading**.

The full setup (`docker-compose.arm64.yml`) also runs the scripts in `db/scripts/` first, to turn on the monitoring extensions (`pg_stat_monitor` and `pg_wait_sampling`, built into the image, and `pg_stat_statements` and others) for New Relic: `01-setup-monitoring-config.sh`, `02-install-monitoring-extensions.sql` and `03-monitoring-post-setup.sh`. The compose file starts PostgreSQL with `shared_preload_libraries=pg_stat_statements,pg_stat_monitor,pg_wait_sampling` for this to work. The scripts are copied into the image, so after editing one, rebuild it (`up -d --build db`) before the change takes effect on a new volume.

If any of these scripts fails, the container may still start, but the database is left half-built, and PostgreSQL will not run the scripts again on that volume. That is the usual cause of an empty "no restaurants" site. See Troubleshooting below.

## Everyday commands

Use the `:full` version of a script when you run the full setup.

```bash
npm run db:connect:simple      # psql in the database container
npm run db:backup:simple       # writes backup_<date>.sql in the current folder
npm run db:restore:simple      # restores backup.sql from the current folder
npm run docker:clean           # stop everything and delete the database volume
```

Check that the data loaded:

```bash
docker exec orderup-db psql -U orderup_user -d orderup -c "SELECT count(*) FROM restaurants;"   # 39
```

To change the restaurants, edit `server/data/restaurants.json`, regenerate the import file, then start from a fresh volume:

```bash
npm run db:generate-import-uuid   # rewrites db/init/02-import-restaurants-uuid.sql
npm run docker:clean
npm run docker:dev:simple
```

`npm run db:test` runs `db/scripts/test-database.js`, which connects to `DB_HOST:DB_PORT` from your machine and prints some statistics. Because the Docker databases are not published, it only works against a PostgreSQL you can reach directly (for example one you installed locally).

`npm run db:logs` follows the database container's log (`docker logs -f orderup-db`).

## Restaurant data

`server/data/restaurants.json` holds 39 restaurants. `db/scripts/import-restaurants-uuid.js` reads it and:

1. generates a deterministic UUID for each restaurant from its string id, so the ids are the same every time;
2. assigns each menu item a category from keywords in its name (Appetizers, Soups, Salads, Sides, Beverages, Desserts, Pizza, and so on, with a default for the rest);
3. writes the INSERT statements to `db/init/02-import-restaurants-uuid.sql`.

The restaurant's `price` level (1 to 5) is not stored: `server/database.js` calculates it from the average price of the restaurant's menu items (under 8 is level 1, under 12 is 2, under 16 is 3, under 20 is 4). With the current menus every restaurant lands at level 1, so the price filter on the Restaurants page has little to filter on.

## Useful queries

```sql
-- Restaurants by cuisine
SELECT cuisine_type, count(*) FROM restaurants GROUP BY cuisine_type ORDER BY count(*) DESC;

-- Menu for one restaurant
SELECT mi.name, mi.price, mi.category
FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id
WHERE r.name = 'Angular Pizza' ORDER BY mi.category, mi.name;

-- Orders and where they are in the lifecycle
SELECT status, count(*) FROM orders GROUP BY status;
```

## Troubleshooting

**The database container exits at start-up.** Compose could not find `DB_PASSWORD`. Run through the npm scripts (they pass `--env-file .env`) and check `.env` is in the repository root. See the [Docker Comprehensive Guide](../troubleshooting/DOCKER_COMPREHENSIVE_GUIDE.md).

**The site has no restaurants, or there are no tables.** An init script failed on first start. Find the first error, fix it, and start again from a fresh volume:

```bash
docker logs orderup-db 2>&1 | grep -iE "error|fatal|bad interpreter"
npm run docker:clean
npm run docker:dev:full
```

Two failures seen in practice: a shell script in `db/scripts/` checked out with Windows line endings (`/bin/bash^M: bad interpreter`; `.gitattributes` forces LF for these files, so re-check out the file if you see it), and `pg_stat_statements must be loaded via shared_preload_libraries`.

**"password authentication failed".** You changed `DB_PASSWORD` after the volume was created. The volume still holds the old password: `npm run docker:clean` and start again (this deletes the data).

**Port 5432 is in use** (only matters if you publish the port yourself): `lsof -i :5432`.

## On EC2

`install-orderup.sh` installs PostgreSQL 16 on the instance, creates the `orderup` database, runs `/opt/orderup/database/init/01-init-schema.sql` and the import, turns on the monitoring extensions, and creates a read-only `newrelic` user for the New Relic PostgreSQL integration. See [EC2 Troubleshooting](../troubleshooting/EC2_TROUBLESHOOTING.md) (`sudo -u postgres psql -d orderup`) and [New Relic Infrastructure Setup](../NEW_RELIC_INFRA_SETUP.md).

For anything beyond a demo, use a managed database (RDS, Cloud SQL), turn on TLS, and set up backups and connection pooling.
