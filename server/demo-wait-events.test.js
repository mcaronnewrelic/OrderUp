const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const DemoWaitEvents = require("./demo-wait-events");

/** A stand-in for pg's Client that records what each session does. */
function fakeDatabase({ failConnectFor = null } = {}) {
  const log = [];
  const clients = [];
  let release;
  const blockerCommitted = new Promise((resolve) => { release = resolve; });

  const createClient = (config) => {
    const name = config.application_name.replace("orderup-wait-demo-", "");
    const client = {
      name,
      ended: false,
      async connect() {
        if (name === failConnectFor) throw new Error("connection refused");
        log.push(`${name}: connect`);
      },
      async query(sql) {
        log.push(`${name}: ${sql}`);
        if (/pg_backend_pid/.test(sql)) return { rows: [{ pid: 4242 }] };
        // A waiter's UPDATE only returns once the blocker has committed.
        if (name.startsWith("waiter") && sql.startsWith("UPDATE")) {
          await blockerCommitted;
          log.push(`${name}: released`);
          return { rows: [] };
        }
        if (sql === "COMMIT") release();
        return { rows: [] };
      },
      async end() {
        client.ended = true;
        log.push(`${name}: end`);
      },
    };
    clients.push(client);
    return client;
  };
  return { createClient, log, clients };
}

function tempStateFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orderup-wait-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "demo-wait-events.json");
}

function make(t, options = {}) {
  const db = options.db || fakeDatabase();
  const events = [];
  const demo = new DemoWaitEvents(null, {
    createClient: db.createClient,
    newrelic: { recordCustomEvent: (type, attributes) => events.push({ type, attributes }) },
    env: {},
    stateFile: tempStateFile(t),
    episodeSeconds: 0.05,
    intervalSeconds: 0.05,
    ...options,
  });
  t.after(() => demo.stop());
  return { demo, db, events };
}

const indexOf = (log, entry) => log.findIndex((line) => line.startsWith(entry));

test("an episode seeds the statements, blocks waiters behind an idle transaction, then releases them", async (t) => {
  const { demo, db, events } = make(t);
  const result = await demo.runEpisode();

  assert.equal(result.ok, true);
  assert.equal(result.blockerPid, 4242);
  assert.equal(result.waiters, 2);

  const { log } = db;
  // The scratch table is created, and the contended statement is run once uncontended.
  assert.ok(indexOf(log, "setup: CREATE TABLE IF NOT EXISTS demo_wait_events") >= 0);
  assert.ok(indexOf(log, "setup: UPDATE demo_wait_events") >= 0);
  assert.ok(indexOf(log, "setup: SELECT pg_sleep(0)") >= 0);

  // The blocker updates inside an open transaction and does not commit straight away.
  const begin = indexOf(log, "blocker: BEGIN");
  const update = indexOf(log, "blocker: UPDATE demo_wait_events");
  const commit = indexOf(log, "blocker: COMMIT");
  assert.ok(begin >= 0 && begin < update && update < commit, "BEGIN, UPDATE, then COMMIT");

  // Both waiters ran the same UPDATE, and neither was released before the commit.
  for (const waiter of ["waiter-1", "waiter-2"]) {
    assert.ok(indexOf(log, `${waiter}: UPDATE demo_wait_events`) < commit, `${waiter} started waiting first`);
    assert.ok(indexOf(log, `${waiter}: released`) > commit, `${waiter} waited for the commit`);
  }
  assert.ok(indexOf(log, "sleeper: SELECT pg_sleep(") >= 0);

  // Safety nets are set, and every session is closed.
  assert.ok(log.some((line) => /^blocker: SET idle_in_transaction_session_timeout = \d+$/.test(line)));
  assert.ok(log.some((line) => /^waiter-1: SET lock_timeout = \d+$/.test(line)));
  assert.equal(db.clients.length, 5);
  assert.ok(db.clients.every((client) => client.ended));

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "DemoWaitEpisode");
  assert.equal(events[0].attributes.ok, true);
});

test("it only ever touches its own scratch table", async (t) => {
  const { demo, db } = make(t);
  await demo.runEpisode();
  const touched = db.log.filter((line) => /orders|customers|restaurants|menu_items/i.test(line));
  assert.deepEqual(touched, []);
});

test("a failed episode is recorded, never thrown, and leaves no session open", async (t) => {
  const db = fakeDatabase({ failConnectFor: "blocker" });
  const { demo, events } = make(t, { db });
  const result = await demo.runEpisode();

  assert.equal(result.ok, false);
  assert.match(result.error, /connection refused/);
  assert.equal(demo.running, false);
  assert.ok(db.clients.length >= 2);
  assert.ok(db.clients.every((client) => client.ended), "every opened session is closed");
  assert.equal(events[0].attributes.ok, false);
  assert.equal(demo.getState().lastEpisode.ok, false);
});

test("only one episode runs at a time", async (t) => {
  const { demo, db } = make(t);
  const first = demo.runEpisode();
  const second = await demo.runEpisode(); // returns straight away while the first runs
  await first;
  assert.equal(second, null, "nothing to report yet: the first episode is still running");
  assert.equal(db.clients.length, 5, "the second call opened no sessions of its own");
  assert.equal(demo.episodes, 1);
});

test("without a database it does nothing and says why", async (t) => {
  const { demo, db } = make(t, { isAvailable: () => false });
  const result = await demo.runEpisode();
  assert.equal(result.ok, false);
  assert.match(result.error, /No database/);
  assert.equal(db.clients.length, 0);
  assert.equal(demo.getState().databaseAvailable, false);
});

test("the environment arms it, and a manual choice wins and survives a restart", async (t) => {
  const stateFile = tempStateFile(t);
  const armedByEnv = new DemoWaitEvents(null, { env: { DEMO_DB_WAIT_EVENTS: "1" }, stateFile, newrelic: null });
  assert.deepEqual([armedByEnv.enabled, armedByEnv.source], [true, "env"]);

  armedByEnv.setManual("off");
  assert.deepEqual([armedByEnv.enabled, armedByEnv.source], [false, "manual"]);

  // A new instance reads the saved choice.
  const restarted = new DemoWaitEvents(null, { env: { DEMO_DB_WAIT_EVENTS: "1" }, stateFile, newrelic: null });
  assert.deepEqual([restarted.enabled, restarted.source], [false, "manual"]);

  restarted.clearManual();
  assert.deepEqual([restarted.enabled, restarted.source], [true, "env"]);
  assert.equal(fs.existsSync(stateFile), false, "clearing the override removes the file");

  const unarmed = new DemoWaitEvents(null, { env: { DEMO_DB_WAIT_EVENTS: "off" }, stateFile, newrelic: null });
  assert.deepEqual([unarmed.enabled, unarmed.source], [false, "none"]);
});

test("timing comes from the environment, within sane limits", () => {
  const read = (env, manual) => {
    const demo = new DemoWaitEvents(null, { env, stateFile: "nonexistent/none.json", newrelic: null });
    if (manual) demo.manual = manual;
    return [demo.intervalSeconds, demo.episodeSeconds];
  };
  assert.deepEqual(read({}), [180, 20]);
  assert.deepEqual(read({ DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS: "600", DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS: "30" }), [600, 30]);
  assert.deepEqual(read({ DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS: "1", DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS: "1" }), [30, 5]);
  assert.deepEqual(read({ DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS: "99999", DEMO_DB_WAIT_EVENTS_EPISODE_SECONDS: "9999" }), [3600, 60]);
  assert.deepEqual(read({ DEMO_DB_WAIT_EVENTS_INTERVAL_SECONDS: "nonsense" }), [180, 20]);
  assert.equal(read({}, { mode: "on", intervalSeconds: 90 })[0], 90, "an instructor's interval wins");
});

test("when armed it runs straight away and then on a schedule; disarming stops it", async (t) => {
  const { demo } = make(t);
  let runs = 0;
  demo.runEpisode = async () => { runs += 1; };

  demo.setManual("on");
  demo.sync();
  await new Promise((resolve) => setTimeout(resolve, 230));
  assert.ok(runs >= 3, `expected several episodes, got ${runs}`);
  assert.ok(demo.getState().nextEpisodeAt, "the next episode is scheduled");

  demo.setManual("off");
  demo.sync();
  const stopped = runs;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(runs, stopped, "no episodes after disarming");
  assert.equal(demo.getState().nextEpisodeAt, null);
});

test("it never schedules episodes when no database is in use", async (t) => {
  const { demo } = make(t, { isAvailable: () => false });
  let runs = 0;
  demo.runEpisode = async () => { runs += 1; };
  demo.setManual("on");
  demo.sync();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(runs, 0);
});

test("stop() ends the schedule for good", async (t) => {
  const { demo } = make(t);
  let runs = 0;
  demo.runEpisode = async () => { runs += 1; };
  demo.setManual("on");
  demo.sync();
  await new Promise((resolve) => setTimeout(resolve, 80));
  demo.stop();
  const before = runs;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(runs, before);
});

// ---- the HTTP routes (server/routes/demo.js) -------------------------------

async function withRoutes(t, demo) {
  const express = require("express");
  const createDemoRouter = require("./routes/demo");
  const quiet = { info() {}, warn() {}, error() {} };
  const app = express();
  app.use(
    "/api",
    createDemoRouter({
      logger: quiet,
      environment: {},
      demoFailures: { getState: () => ({ armed: null, source: "none" }) },
      demoInvestigations: { getState: () => ({ armed: null, source: "none" }) },
      demoWaitEvents: demo,
      dashboardLinks: {},
    }),
  );
  const server = require("node:http").createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/demo/wait-events`;
  const call = async (method, body) => {
    const response = await fetch(base, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return call;
}

test("routes: state, arm, disarm and clear", async (t) => {
  const { demo } = make(t);
  demo.runEpisode = async () => {}; // the schedule's episodes are not under test here
  const call = await withRoutes(t, demo);

  const initial = await call("GET");
  assert.equal(initial.status, 200);
  assert.equal(initial.body.enabled, false);
  assert.equal(initial.body.source, "none");

  const armed = await call("POST", { mode: "on", intervalSeconds: 120 });
  assert.equal(armed.status, 200);
  assert.deepEqual([armed.body.enabled, armed.body.source, armed.body.intervalSeconds], [true, "manual", 0.05]);
  assert.ok(armed.body.nextEpisodeAt || armed.body.episodes >= 0);

  const off = await call("POST", { mode: "off" });
  assert.deepEqual([off.body.enabled, off.body.source], [false, "manual"]);
  assert.equal(off.body.nextEpisodeAt, null, "disarming stops the schedule");

  const cleared = await call("DELETE");
  assert.deepEqual([cleared.body.enabled, cleared.body.source], [false, "none"]);
});

test("routes: run-now starts one episode even when disarmed, and bad requests are refused", async (t) => {
  const { demo } = make(t);
  let runs = 0;
  demo.runEpisode = async () => { runs += 1; };
  const call = await withRoutes(t, demo);

  const runNow = await call("POST", { action: "run-now" });
  assert.equal(runNow.status, 200);
  assert.equal(runs, 1);
  assert.equal(runNow.body.enabled, false, "run-now does not arm the schedule");

  for (const bad of [{}, { mode: "maybe" }, { mode: 1 }]) {
    const refused = await call("POST", bad);
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /mode/);
  }
  assert.equal(runs, 1);
});
