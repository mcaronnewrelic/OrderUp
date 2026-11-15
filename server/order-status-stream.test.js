const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { WebSocket } = require("ws");
const OrderStatusStream = require("./order-status-stream");

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(String(data)));
      } catch (err) {
        reject(err);
      }
    });
    socket.once("error", reject);
  });
}

test("subscribe answers with a snapshot, publish pushes advances to subscribers only", async (t) => {
  const statuses = new Map([["42", "preparing"]]);
  const stream = new OrderStatusStream(null, async (id) => statuses.get(id) ?? null);
  const server = http.createServer();
  stream.attach(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    stream.close();
    server.close();
  });
  const port = server.address().port;

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/orders/stream`);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  t.after(() => socket.terminate());

  socket.send(JSON.stringify({ type: "subscribe", orderId: "42" }));
  const snapshot = await nextMessage(socket);
  assert.deepEqual(snapshot, { type: "status", orderId: "42", status: "preparing" });

  // An advance for a different order must not reach this subscriber.
  stream.publish("99", "delivered");
  const advanced = nextMessage(socket);
  stream.publish("42", "out_for_delivery");
  assert.deepEqual(await advanced, {
    type: "status",
    orderId: "42",
    status: "out_for_delivery",
  });

  // Unknown orders snapshot as pending (the tracker's initial stage).
  const other = new WebSocket(`ws://127.0.0.1:${port}/api/orders/stream`);
  await new Promise((resolve, reject) => {
    other.once("open", resolve);
    other.once("error", reject);
  });
  t.after(() => other.terminate());
  other.send(JSON.stringify({ type: "subscribe", orderId: "7" }));
  assert.deepEqual(await nextMessage(other), {
    type: "status",
    orderId: "7",
    status: "pending",
  });
});

/** A stand-in for the New Relic agent that records what the stream reports. */
function createFakeNewrelic() {
  const calls = { transactions: [], events: [], metrics: [] };
  let current = null;
  const fakeNewrelic = {
    // Like the real agent, a background transaction ends when its callback settles.
    async startBackgroundTransaction(name, callback) {
      const record = { name, ended: false, attributes: {} };
      calls.transactions.push(record);
      current = record;
      try {
        return await callback();
      } finally {
        record.ended = true;
      }
    },
    addCustomAttributes(attributes) {
      Object.assign(current.attributes, attributes);
    },
    recordCustomEvent(type, attributes) {
      calls.events.push({ type, attributes });
    },
    recordMetric(name, value) {
      calls.metrics.push({ name, value });
    },
  };
  return { calls, fakeNewrelic };
}

/** Let a released transaction callback settle. */
async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("a subscribe is a short background transaction; the connection is one OrderStreamSample at close", async (t) => {
  const { calls, fakeNewrelic } = createFakeNewrelic();
  const stream = new OrderStatusStream(null, async () => "preparing", fakeNewrelic);
  const server = http.createServer();
  stream.attach(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    stream.close();
    server.close();
  });
  const port = server.address().port;

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/orders/stream`);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "subscribe", orderId: "42", demoCode: "OU-TEST" }));
  await nextMessage(socket); // snapshot
  await settle();

  // The transaction covers the subscribe, not the connection: it is
  // already finished while the socket is still open.
  assert.equal(calls.transactions.length, 1);
  assert.equal(calls.transactions[0].name, "OrderStatusStream/subscribe");
  assert.equal(calls.transactions[0].ended, true);
  assert.equal(calls.transactions[0].attributes.orderId, "42");
  assert.equal(calls.transactions[0].attributes.demoCode, "OU-TEST");
  assert.equal(calls.transactions[0].attributes.snapshotFailed, false);
  assert.equal(typeof calls.transactions[0].attributes.snapshotLookupMs, "number");

  const advanced = nextMessage(socket);
  stream.publish("42", "delivered");
  await advanced;

  socket.close(1000);
  await new Promise((resolve) => socket.once("close", resolve));
  await settle();

  // Pushes and the close add no transactions.
  assert.equal(calls.transactions.length, 1);

  const samples = calls.events.filter((event) => event.type === "OrderStreamSample");
  assert.equal(samples.length, 1);
  const sample = samples[0].attributes;
  // Counts
  assert.equal(sample.messagesReceived, 1);
  assert.equal(sample.messagesSent, 2);
  assert.equal(sample.pushesSent, 1);
  // Who and what
  assert.equal(sample.orderId, "42");
  assert.equal(sample.demoCode, "OU-TEST");
  // What the client saw, and whether it saw the order through
  assert.equal(sample.firstStatus, "preparing");
  assert.equal(sample.lastStatus, "delivered");
  assert.equal(sample.reachedTerminal, true);
  assert.equal(sample.outcome, "saw_final_status");
  // How it ended
  assert.equal(sample.closeCode, 1000);
  assert.equal(sample.closeCategory, "normal");
  assert.equal(sample.snapshotFailed, false);
  assert.equal(sample.errors, 0);
  // Where the time went
  for (const key of [
    "connectedDurationMs",
    "subscribeDelayMs",
    "snapshotLookupMs",
    "msToFirstPush",
    "idleBeforeCloseMs",
  ]) {
    assert.equal(typeof sample[key], "number", key);
  }

  // One OrderStreamPush per status frame: the snapshot, then the push.
  const pushes = calls.events.filter((event) => event.type === "OrderStreamPush");
  assert.deepEqual(
    pushes.map((event) => [event.attributes.kind, event.attributes.status, event.attributes.demoCode]),
    [
      ["snapshot", "preparing", "OU-TEST"],
      ["push", "delivered", "OU-TEST"],
    ],
  );

  // The concurrency gauge moved up on connect and back down on close.
  assert.deepEqual(
    calls.metrics.map((metric) => [metric.name, metric.value]),
    [
      ["Custom/OrderStream/OpenConnections", 1],
      ["Custom/OrderStream/OpenConnections", 0],
    ],
  );
});

test("a connection that leaves early or never subscribes is labelled as such", async (t) => {
  const { calls, fakeNewrelic } = createFakeNewrelic();
  const stream = new OrderStatusStream(
    null,
    async () => { throw new Error("database is down"); },
    fakeNewrelic,
  );
  const server = http.createServer();
  stream.attach(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    stream.close();
    server.close();
  });
  const url = `ws://127.0.0.1:${server.address().port}/api/orders/stream`;

  // 1. Subscribes, the snapshot lookup fails, then the visitor navigates away.
  const early = new WebSocket(url);
  await new Promise((resolve, reject) => {
    early.once("open", resolve);
    early.once("error", reject);
  });
  // An invalid demoCode is ignored rather than recorded.
  early.send(JSON.stringify({ type: "subscribe", orderId: "7", demoCode: "<script>" }));
  assert.equal((await nextMessage(early)).status, "pending"); // the fallback answer
  early.close(1001);
  await new Promise((resolve) => early.once("close", resolve));
  await settle();

  // 2. Connects and closes without ever subscribing.
  const silent = new WebSocket(url);
  await new Promise((resolve, reject) => {
    silent.once("open", resolve);
    silent.once("error", reject);
  });
  silent.close(1000);
  await new Promise((resolve) => silent.once("close", resolve));
  await settle();

  const [left, never] = calls.events
    .filter((event) => event.type === "OrderStreamSample")
    .map((event) => event.attributes);

  assert.equal(left.outcome, "left_before_final_status");
  assert.equal(left.closeCategory, "client_navigated_away");
  assert.equal(left.snapshotFailed, true);
  assert.equal(left.lastStatus, "pending");
  assert.equal(left.reachedTerminal, false);
  assert.equal("demoCode" in left, false);
  assert.equal("msToFirstPush" in left, false);

  // Only the subscribing connection ran a transaction, and it saw the failed lookup.
  assert.equal(calls.transactions.length, 1);
  assert.equal(calls.transactions[0].attributes.snapshotFailed, true);

  assert.equal(never.outcome, "never_subscribed");
  assert.equal(never.subscribed, false);
  assert.equal(never.messagesSent, 0);
  assert.equal("orderId" in never, false);
});

test("upgrades to other paths are refused", async (t) => {
  const stream = new OrderStatusStream(null, async () => null);
  const server = http.createServer();
  stream.attach(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    stream.close();
    server.close();
  });
  const port = server.address().port;

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/orders`);
  await assert.rejects(
    new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    }),
  );
  socket.terminate();
});
