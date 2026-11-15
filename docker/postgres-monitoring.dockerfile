# PostgreSQL Dockerfile with monitoring extensions
# Based on CloudFormation setup_postgresql_monitoring() configuration

# ---------------------------------------------------------------------------
# Build pg_stat_monitor (Percona). The New Relic PostgreSQL integration needs
# it for "individual queries" and execution plans (PostgresIndividualQueries,
# PostgresExecutionPlanMetrics); without it, those charts stay empty. The
# stock image only ships pg_stat_statements, which covers slow queries.
# The compilers stay in this stage; only the built extension files are copied.
# ---------------------------------------------------------------------------
FROM postgres:16-alpine AS pg_stat_monitor

ARG PG_STAT_MONITOR_VERSION=2.4.0

# The PostgreSQL server headers include the headers of the libraries the base
# image was built with (OpenSSL, Kerberos/GSSAPI, ICU, ...), so the build stage
# needs their development packages even though this extension does not use them.
RUN apk add --no-cache build-base curl linux-headers \
      openssl-dev krb5-dev icu-dev libxml2-dev lz4-dev zstd-dev zlib-dev \
 && mkdir /src \
 && curl -fsSL "https://github.com/percona/pg_stat_monitor/archive/refs/tags/${PG_STAT_MONITOR_VERSION}.tar.gz" \
      | tar -xz -C /src --strip-components=1 \
 && cd /src \
 && make USE_PGXS=1 with_llvm=no \
 && make USE_PGXS=1 with_llvm=no install DESTDIR=/out

# ---------------------------------------------------------------------------
# Build pg_wait_sampling (Postgres Professional). It samples what every backend
# is waiting on; the New Relic PostgreSQL integration reads its history for
# PostgresWaitEvents. Same build recipe and the same development packages as above.
# ---------------------------------------------------------------------------
FROM postgres:16-alpine AS pg_wait_sampling

ARG PG_WAIT_SAMPLING_VERSION=1.1.11

RUN apk add --no-cache build-base curl linux-headers       openssl-dev krb5-dev icu-dev libxml2-dev lz4-dev zstd-dev zlib-dev  && mkdir /src  && curl -fsSL "https://github.com/postgrespro/pg_wait_sampling/archive/refs/tags/v${PG_WAIT_SAMPLING_VERSION}.tar.gz"       | tar -xz -C /src --strip-components=1  && cd /src  && make USE_PGXS=1 with_llvm=no  && make USE_PGXS=1 with_llvm=no install DESTDIR=/out

# ---------------------------------------------------------------------------
FROM postgres:16-alpine

# The other contrib modules (pg_stat_statements, pg_buffercache, pgstattuple,
# pgrowlocks) are already in the base image.
COPY --from=pg_stat_monitor /out/usr/local/ /usr/local/
COPY --from=pg_wait_sampling /out/usr/local/ /usr/local/

# Create directory for custom scripts
RUN mkdir -p /docker-entrypoint-initdb.d/scripts

# Copy monitoring setup scripts
COPY db/scripts/ /docker-entrypoint-initdb.d/

# init_database.sql is an older schema (it indexes a column named "cuisine"; the real
# one is cuisine_type, created by db/init/01-init-schema.sql). Run last on a new volume
# it fails and aborts initialization - hidden only because the container's restart
# policy starts it again on the half-initialized data directory. Nothing needs it.
RUN rm -f /docker-entrypoint-initdb.d/init_database.sql

# Set proper permissions for scripts
RUN chmod +x /docker-entrypoint-initdb.d/*.sh 2>/dev/null || true

# Expose PostgreSQL port
EXPOSE 5432

# Use the default PostgreSQL entrypoint
# The monitoring scripts will be executed automatically during initialization
