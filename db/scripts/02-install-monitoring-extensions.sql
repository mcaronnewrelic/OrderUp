-- PostgreSQL Monitoring Extensions Installation
-- Based on CloudFormation setup_postgresql_monitoring() function
-- This script installs all the monitoring extensions required for comprehensive PostgreSQL monitoring

\echo 'Installing PostgreSQL monitoring extensions...'

-- Install pg_stat_statements extension for query performance tracking
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
\echo 'pg_stat_statements extension installed'

-- Install pg_buffercache extension for buffer cache monitoring
CREATE EXTENSION IF NOT EXISTS pg_buffercache;
\echo 'pg_buffercache extension installed'

-- Install pgstattuple extension for table-level statistics and bloat analysis
CREATE EXTENSION IF NOT EXISTS pgstattuple;
\echo 'pgstattuple extension installed'

-- Install pgrowlocks extension for row-level locking information
CREATE EXTENSION IF NOT EXISTS pgrowlocks;
\echo 'pgrowlocks extension installed'

-- Install pg_stat_monitor (Percona), built into the image by docker/postgres-monitoring.dockerfile.
-- The New Relic PostgreSQL integration needs it for individual queries and execution plans
-- (PostgresIndividualQueries, PostgresExecutionPlanMetrics).
CREATE EXTENSION IF NOT EXISTS pg_stat_monitor;
\echo 'pg_stat_monitor extension installed'

-- Install pg_wait_sampling, built into the image by docker/postgres-monitoring.dockerfile.
-- The New Relic PostgreSQL integration reads its history for wait events (PostgresWaitEvents).
CREATE EXTENSION IF NOT EXISTS pg_wait_sampling;
\echo 'pg_wait_sampling extension installed'

-- Install tablefunc, whose crosstab() the New Relic PostgreSQL integration needs for the
-- db.locks.* metrics (COLLECT_DB_LOCK_METRICS); without it that integration sends none.
CREATE EXTENSION IF NOT EXISTS tablefunc;
\echo 'tablefunc extension installed'

-- Verify all extensions are installed
\echo 'Verifying installed extensions:'
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('pg_stat_statements', 'pg_stat_monitor', 'pg_wait_sampling', 'pg_buffercache', 'pgstattuple', 'pgrowlocks', 'tablefunc')
ORDER BY extname;

-- Show pg_stat_statements configuration
\echo 'Current pg_stat_statements configuration:'
SELECT name, setting, unit, context, short_desc
FROM pg_settings 
WHERE name LIKE 'pg_stat_statements%'
ORDER BY name;

-- Display monitoring readiness status
\echo 'PostgreSQL monitoring extensions installation completed!'
\echo 'Installed extensions: pg_stat_statements, pg_stat_monitor, pg_buffercache, pgstattuple, pgrowlocks'
\echo 'These extensions provide comprehensive monitoring capabilities for New Relic PostgreSQL integration.'