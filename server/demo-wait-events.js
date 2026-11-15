/**
 * Demo wait events: a scheduled, instructor-armed generator of database
 * waits, so the New Relic PostgreSQL integration has something to report
 * (PostgresWaitEvents and PostgresBlockingSessions).
 *
 * Why it exists. This app's own queries never wait on anything, so those
 * charts would stay empty. Every few minutes, while it is armed, the
 * generator runs one short "episode" on a scratch table of its own
 * (demo_wait_events - never orders or customers, so no visitor is ever
 * blocked):
 *
 *   1. It runs the contended UPDATE once, uncontended. The integration
 *      only reports a blocking session whose statement it has already seen
 *      finish, so this seeds pg_stat_statements.
 *   2. A blocker session BEGINs, runs the UPDATE and then sits "idle in
 *      transaction" for the episode - the blocker has to be idle after a
 *      finished statement, not mid-statement, to be reported.
 *   3. A few waiter sessions run the same UPDATE and wait on the row lock
 *      (Lock:transactionid).
 *   4. One more session runs pg_sleep (Timeout:PgSleep).
 *   5. The blocker COMMITs, everything finishes, every session closes.
 *
 * Armed by DEMO_DB_WAIT_EVENTS (anything but empty, 0 or off) or from the
 * instructor page; the manual choice persists in data/demo-wait-events.json
 * and wins over the environment, like the other demo switches. Timing:
 * DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS (default 180) and
 * DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS (default 20).
 *
 * Safety: every session is named orderup-wait-demo-*, the blocker has an
 * idle_in_transaction_session_timeout so it cannot outlive a crashed server,
 * and any failure is recorded and swallowed - this must never take the app
 * down. Deliberately unauthenticated, like the other demo controls.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { adminClientConfig } = require('./db-admin-config');

const STATE_FILE = path.join(__dirname, 'data', 'demo-wait-events.json');
const TABLE = 'demo_wait_events';
const CONTENDED_SQL = `UPDATE ${TABLE} SET note = 'wait-events demo' WHERE id = 1`;
const WAITERS = 2;

const DEFAULT_INTERVAL_SECONDS = 180;
const MIN_INTERVAL_SECONDS = 30;
const MAX_INTERVAL_SECONDS = 3600;
const DEFAULT_EPISODE_SECONDS = 20;
const MIN_EPISODE_SECONDS = 5;
const MAX_EPISODE_SECONDS = 60;

function envTruthy(value) {
  return !!value && value !== '0' && value !== 'off';
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, min), max);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DemoWaitEvents {
  /**
   * @param logger   pino-style logger
   * @param options  newrelic, isAvailable (is a database in use?), createClient,
   *                 env, stateFile, and episodeSeconds / intervalSeconds to
   *                 override the environment (used by tests, unclamped)
   */
  constructor(logger, options = {}) {
    this.logger = logger;
    // An explicit null means "no agent"; leaving it out loads the real one.
    this.newrelic = options.newrelic !== undefined ? options.newrelic : safeRequireNewrelic();
    this.isAvailable = options.isAvailable || (() => true);
    this.createClient = options.createClient || ((config) => new Client(config));
    this.env = options.env || process.env;
    this.stateFile = options.stateFile || STATE_FILE;
    this.fixedEpisodeSeconds = options.episodeSeconds;
    this.fixedIntervalSeconds = options.intervalSeconds;

    this.manual = this.loadManual();
    this.timer = null;
    this.running = false;
    this.stopping = false;
    this.episodes = 0;
    this.lastEpisode = null;
    this.nextEpisodeAt = null;
  }

  // ---- state -------------------------------------------------------------

  loadManual() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      if (parsed && (parsed.mode === 'on' || parsed.mode === 'off')) return parsed;
    } catch { /* no override yet */ }
    return null;
  }

  saveManual() {
    try {
      if (this.manual) {
        fs.writeFileSync(this.stateFile, JSON.stringify(this.manual, null, 2));
      } else {
        fs.rmSync(this.stateFile, { force: true });
      }
    } catch (err) {
      this.logger?.warn({ err }, 'Could not persist the wait-events override; it will last until restart');
    }
  }

  envArmed() {
    return envTruthy(this.env.DEMO_DB_WAIT_EVENTS);
  }

  /** Where the arming comes from: a manual choice, the environment, or neither. */
  get source() {
    if (this.manual) return 'manual';
    return this.envArmed() ? 'env' : 'none';
  }

  get enabled() {
    if (this.manual) return this.manual.mode === 'on';
    return this.envArmed();
  }

  get intervalSeconds() {
    if (this.fixedIntervalSeconds != null) return this.fixedIntervalSeconds;
    const manual = this.manual?.intervalSeconds;
    return clamp(
      manual ?? this.env.DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS,
      MIN_INTERVAL_SECONDS,
      MAX_INTERVAL_SECONDS,
      DEFAULT_INTERVAL_SECONDS,
    );
  }

  get episodeSeconds() {
    if (this.fixedEpisodeSeconds != null) return this.fixedEpisodeSeconds;
    return clamp(
      this.env.DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS,
      MIN_EPISODE_SECONDS,
      MAX_EPISODE_SECONDS,
      DEFAULT_EPISODE_SECONDS,
    );
  }

  getState() {
    return {
      source: this.source,
      enabled: this.enabled,
      databaseAvailable: !!this.isAvailable(),
      intervalSeconds: this.intervalSeconds,
      episodeSeconds: this.episodeSeconds,
      running: this.running,
      episodes: this.episodes,
      nextEpisodeAt: this.nextEpisodeAt ? new Date(this.nextEpisodeAt).toISOString() : null,
      lastEpisode: this.lastEpisode,
    };
  }

  setManual(mode, intervalSeconds) {
    this.manual = { mode: mode === 'on' ? 'on' : 'off' };
    if (mode === 'on' && intervalSeconds != null) {
      this.manual.intervalSeconds = clamp(
        intervalSeconds,
        MIN_INTERVAL_SECONDS,
        MAX_INTERVAL_SECONDS,
        DEFAULT_INTERVAL_SECONDS,
      );
    }
    this.saveManual();
    return this.getState();
  }

  clearManual() {
    this.manual = null;
    this.saveManual();
    return this.getState();
  }

  // ---- schedule ----------------------------------------------------------

  /**
   * Bring the timer in line with the arming: start the schedule (first
   * episode straight away) when armed, stop it when not. Safe to call any
   * time; start.js calls it at boot and the routes call it after a change.
   */
  sync() {
    this.stopping = false;
    this.clearTimer();
    if (!this.enabled || !this.isAvailable()) {
      this.nextEpisodeAt = null;
      return;
    }
    this.scheduleNext(0);
  }

  scheduleNext(delayMs) {
    this.clearTimer();
    this.nextEpisodeAt = Date.now() + delayMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
    this.timer.unref?.();
  }

  async tick() {
    if (this.stopping || !this.enabled || !this.isAvailable()) {
      this.nextEpisodeAt = null;
      return;
    }
    await this.runEpisode();
    // Re-check: it may have been switched off while the episode ran.
    if (!this.stopping && this.enabled && this.isAvailable()) {
      this.scheduleNext(this.intervalSeconds * 1000);
    } else {
      this.nextEpisodeAt = null;
    }
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Stop the schedule for good (server shutdown). An episode in flight finishes on its own. */
  stop() {
    this.stopping = true;
    this.clearTimer();
    this.nextEpisodeAt = null;
  }

  // ---- one episode -------------------------------------------------------

  /**
   * Run one episode now, whether or not the schedule is armed ("run now"
   * on the instructor page). Resolves with the episode's record; never
   * rejects. Only one episode runs at a time.
   */
  async runEpisode() {
    if (this.running) return this.lastEpisode;
    if (!this.isAvailable()) {
      return this.record({ startedAt: Date.now(), ok: false, error: 'No database is in use (needs the database-backed deployment).' });
    }
    this.running = true;
    const startedAt = Date.now();
    const episodeMs = this.episodeSeconds * 1000;
    const clients = [];
    let blockerPid = null;
    let waiters = 0;

    const open = async (name, setup = []) => {
      const client = this.createClient({ ...adminClientConfig(), application_name: `orderup-wait-demo-${name}` });
      clients.push(client);
      await client.connect();
      for (const statement of setup) await client.query(statement);
      return client;
    };

    try {
      // 1. Make sure the scratch table exists, and teach pg_stat_statements both statements.
      const setup = await open('setup');
      await setup.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id integer PRIMARY KEY, note text NOT NULL DEFAULT '')`);
      await setup.query(`INSERT INTO ${TABLE} (id) VALUES (1) ON CONFLICT DO NOTHING`);
      await setup.query(CONTENDED_SQL);
      await setup.query(sleepSql(0));

      // 2. The blocker: update the row, then sit idle in the open transaction.
      const safetyMs = Math.ceil(episodeMs) + 20000;
      const blocker = await open('blocker', [`SET idle_in_transaction_session_timeout = ${safetyMs}`]);
      await blocker.query('BEGIN');
      await blocker.query(CONTENDED_SQL);
      blockerPid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;

      // 3. The waiters: the same UPDATE, which now has to wait for the blocker.
      const pending = [];
      for (let i = 0; i < WAITERS; i += 1) {
        const waiter = await open(`waiter-${i + 1}`, [`SET lock_timeout = ${safetyMs}`]);
        pending.push(waiter.query(CONTENDED_SQL));
        waiters += 1;
      }
      // 4. A sleeper, for a Timeout:PgSleep wait.
      const sleeper = await open('sleeper');
      pending.push(sleeper.query(sleepSql(Math.max(1, Math.round(this.episodeSeconds / 2)))));

      // Let the episode run, then release everyone.
      await sleep(episodeMs);
      await blocker.query('COMMIT');
      await Promise.all(pending);

      return this.record({ startedAt, ok: true, blockerPid, waiters, episodeSeconds: this.episodeSeconds });
    } catch (err) {
      this.logger?.warn({ err }, 'Wait-events episode failed');
      return this.record({ startedAt, ok: false, blockerPid, waiters, episodeSeconds: this.episodeSeconds, error: String(err?.message || err) });
    } finally {
      // Closing a connection rolls back anything left open, so nothing outlives the episode.
      await Promise.all(clients.map((client) => Promise.resolve().then(() => client.end()).catch(() => {})));
      this.running = false;
    }
  }

  record(episode) {
    const finishedAt = Date.now();
    this.episodes += 1;
    this.lastEpisode = {
      startedAt: new Date(episode.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - episode.startedAt,
      ok: episode.ok,
      ...(episode.blockerPid != null ? { blockerPid: episode.blockerPid } : {}),
      ...(episode.waiters != null ? { waiters: episode.waiters } : {}),
      ...(episode.episodeSeconds != null ? { episodeSeconds: episode.episodeSeconds } : {}),
      ...(episode.error ? { error: episode.error } : {}),
    };
    this.logger?.info(this.lastEpisode, episode.ok ? 'Wait-events episode finished' : 'Wait-events episode did not run');
    try {
      // So a dashboard can line the episodes up against the waits they caused.
      this.newrelic?.recordCustomEvent?.('DemoWaitEpisode', {
        ok: this.lastEpisode.ok,
        durationMs: this.lastEpisode.durationMs,
        episodeSeconds: this.lastEpisode.episodeSeconds ?? 0,
        waiters: this.lastEpisode.waiters ?? 0,
        blockerPid: this.lastEpisode.blockerPid ?? 0,
        error: this.lastEpisode.error ?? '',
      });
    } catch { /* telemetry must never break the demo */ }
    return this.lastEpisode;
  }
}

/** The pg_sleep statement; its constants are normalized away, so every duration is one statement to pg_stat_statements. */
function sleepSql(seconds) {
  return `SELECT pg_sleep(${Number(seconds)}), 'wait-events demo' AS demo`;
}

function safeRequireNewrelic() {
  try {
    return require('newrelic');
  } catch {
    return null;
  }
}

module.exports = DemoWaitEvents;
module.exports.CONTENDED_SQL = CONTENDED_SQL;
module.exports.TABLE = TABLE;
