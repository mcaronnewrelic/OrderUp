/**
 * Live order status over WebSocket (phase 1: the Thank You tracker).
 *
 * The order-status worker advances orders in Postgres; this module is
 * the push channel that lets a browser watch its own order move
 * (pending -> preparing -> out_for_delivery -> delivered) instead of
 * re-loading My Orders. The worker stays transport-agnostic: start.js
 * wires its onAdvance callback to this module's publish().
 *
 * Protocol (JSON both ways):
 *  - client -> server: { type: 'subscribe', orderId }
 *  - server -> client: { type: 'status', orderId, status }
 *    Sent once as a snapshot when the subscription lands (looked up
 *    through the app's normal order read, so it answers even while
 *    the worker is sick), then again on every worker advance.
 *
 * The endpoint lives under /api/ on purpose: the nginx /api/ location
 * already forwards the Upgrade headers and the ALB passes WebSocket
 * upgrades through, so no infrastructure change was needed. A 30s
 * ping keeps connections ahead of the ALB's idle timeout.
 *
 * APM visibility is manual, on purpose: the upgrade bypasses Express,
 * so the agent never sees this endpoint as a web transaction. The work
 * the server does for a visitor - accepting a subscribe and looking up
 * the snapshot - is wrapped in a short background transaction
 * (OrderStatusStream/subscribe). It is deliberately NOT held open for
 * the connection: a transaction lasting as long as the visitor watches
 * (minutes) would drown the real response times in APM averages. The
 * connection's lifetime is reported instead by an OrderStreamSample
 * custom event at close - the server-side mirror of the browser agent's
 * WebSocket event, likewise emitted once per connection, at close.
 * Telemetry is best-effort throughout: it must never break the stream.
 *
 * What the telemetry is for (diagnosis, not just counting):
 *  - OrderStreamSample answers "what happened on this connection": who (demoCode), which order, what
 *    the client saw (firstStatus -> lastStatus), whether it saw the
 *    order through (outcome), how it ended (closeCode + closeCategory),
 *    and where time went (subscribeDelayMs, snapshotLookupMs,
 *    msToFirstPush, idleBeforeCloseMs).
 *  - OrderStreamPush (one per status frame sent) answers "what was
 *    delivered to whom, and when" - a stuck tracker shows up as a
 *    snapshot with no pushes after it.
 *  - Custom/OrderStream/OpenConnections is the concurrency gauge.
 */
const { WebSocketServer, WebSocket } = require('ws');
const defaultNewrelic = require('newrelic');

const STREAM_PATH = '/api/orders/stream';
const PING_INTERVAL_MS = 30000;
const TERMINAL_STATUSES = ['delivered', 'cancelled'];
const DEMO_CODE_PATTERN = /^(OU|SIM)-[A-Z0-9]{4}$/;

/** Plain-language reading of a WebSocket close code, as seen server-side. */
function closeCategory(closeCode, heartbeatTimeout) {
  if (heartbeatTimeout) return 'heartbeat_timeout'; // we terminated a dead peer
  switch (closeCode) {
    case 1000: return 'normal';
    case 1001: return 'client_navigated_away';
    case 1005: return 'client_closed'; // close() with no code: the tracker finished
    case 1006: return 'abnormal_drop'; // no close frame: network or process died
    default: return 'other';
  }
}

class OrderStatusStream {
  /**
   * @param logger pino-style logger
   * @param getStatus async (orderId) => status string, or null when
   *                  the order is unknown / no database is in use.
   */
  constructor(logger, getStatus, newrelic = defaultNewrelic) {
    this.logger = logger;
    this.getStatus = getStatus;
    this.newrelic = newrelic;
    this.subscribers = new Map(); // orderId -> Set<WebSocket>
    this.wss = new WebSocketServer({ noServer: true });
    this.pingTimer = null;

    this.wss.on('connection', (socket) => {
      socket.isAlive = true;
      socket.telemetry = this.beginTelemetry(socket);
      socket.on('pong', () => { socket.isAlive = true; });
      socket.on('message', (data) => {
        if (socket.telemetry) socket.telemetry.messagesReceived += 1;
        void this.handleMessage(socket, data);
      });
      socket.on('close', (code) => {
        this.endTelemetry(socket, code);
        this.unsubscribeAll(socket);
        this.recordOpenConnections();
      });
      socket.on('error', () => {
        if (socket.telemetry) socket.telemetry.errors += 1;
        this.unsubscribeAll(socket);
      });
      this.recordOpenConnections();
    });
  }

  /** The per-connection counters that endTelemetry turns into an OrderStreamSample. */
  beginTelemetry(socket) {
    return {
      orderId: null,
      demoCode: null,
      messagesReceived: 0,
      messagesSent: 0,
      pushesSent: 0,
      errors: 0,
      connectedAt: Date.now(),
      subscribedAt: null,
      snapshotLookupMs: null,
      snapshotFailed: false,
      firstStatus: null,
      lastStatus: null,
      firstPushAt: null,
      lastSentAt: null,
      heartbeatTimeout: false,
      openConnectionsAtStart: this.wss.clients.size,
    };
  }

  /** One connection's story as flat attributes, for the OrderStreamSample. */
  summarise(telemetry, closeCode) {
    const now = Date.now();
    const subscribed = telemetry.subscribedAt != null;
    const reachedTerminal = TERMINAL_STATUSES.includes(telemetry.lastStatus);
    const attributes = {
      messagesReceived: telemetry.messagesReceived,
      messagesSent: telemetry.messagesSent,
      pushesSent: telemetry.pushesSent,
      connectedDurationMs: now - telemetry.connectedAt,
      closeCode: closeCode ?? 0,
      closeCategory: closeCategory(closeCode ?? 0, telemetry.heartbeatTimeout),
      // Did the visitor see the order through? The quickest triage facet.
      outcome: !subscribed
        ? 'never_subscribed'
        : reachedTerminal
          ? 'saw_final_status'
          : 'left_before_final_status',
      subscribed,
      reachedTerminal,
      snapshotFailed: telemetry.snapshotFailed,
      errors: telemetry.errors,
      idleBeforeCloseMs: now - (telemetry.lastSentAt ?? telemetry.connectedAt),
      openConnectionsAtStart: telemetry.openConnectionsAtStart,
    };
    if (telemetry.orderId) attributes.orderId = telemetry.orderId;
    if (telemetry.demoCode) attributes.demoCode = telemetry.demoCode;
    if (telemetry.firstStatus) attributes.firstStatus = telemetry.firstStatus;
    if (telemetry.lastStatus) attributes.lastStatus = telemetry.lastStatus;
    if (subscribed) attributes.subscribeDelayMs = telemetry.subscribedAt - telemetry.connectedAt;
    if (telemetry.snapshotLookupMs != null) attributes.snapshotLookupMs = telemetry.snapshotLookupMs;
    if (telemetry.firstPushAt != null && subscribed) {
      attributes.msToFirstPush = telemetry.firstPushAt - telemetry.subscribedAt;
    }
    return attributes;
  }

  /** Emit the connection's OrderStreamSample. */
  endTelemetry(socket, closeCode) {
    const telemetry = socket.telemetry;
    if (!telemetry) return;
    socket.telemetry = null;
    try {
      this.newrelic.recordCustomEvent('OrderStreamSample', this.summarise(telemetry, closeCode));
    } catch { /* telemetry must never break the stream */ }
  }

  /**
   * Run work inside a background transaction. If the agent cannot start
   * one, the work still runs - the stream matters more than the telemetry.
   */
  traced(name, work) {
    let started = false;
    const run = () => {
      started = true;
      return work();
    };
    try {
      const result = this.newrelic.startBackgroundTransaction(name, run);
      if (started) return result;
    } catch (err) {
      if (started) throw err;
    }
    return run();
  }

  /** Concurrency gauge: how many sockets are open right now. */
  recordOpenConnections() {
    try {
      this.newrelic.recordMetric?.('Custom/OrderStream/OpenConnections', this.wss.clients.size);
    } catch { /* telemetry must never break the stream */ }
  }

  /** Hook the HTTP server's upgrade event; only the stream path is claimed. */
  attach(server) {
    server.on('upgrade', (request, socket, head) => {
      let pathname;
      try {
        pathname = new URL(request.url, 'http://localhost').pathname;
      } catch {
        pathname = request.url;
      }
      if (pathname !== STREAM_PATH) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });
    this.pingTimer = setInterval(() => {
      for (const socket of this.wss.clients) {
        if (socket.isAlive === false) {
          if (socket.telemetry) socket.telemetry.heartbeatTimeout = true;
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }, PING_INTERVAL_MS);
    this.pingTimer.unref?.();
    this.logger?.info({ path: STREAM_PATH }, 'Order status stream attached');
  }

  async handleMessage(socket, data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return; // Not JSON: not our protocol, ignore.
    }
    if (message?.type !== 'subscribe' || message.orderId == null) return;
    const orderId = String(message.orderId);
    if (socket.telemetry) {
      socket.telemetry.orderId = orderId;
      socket.telemetry.subscribedAt ??= Date.now();
      // Optional, and validated: it is only ever used as a telemetry label.
      if (typeof message.demoCode === 'string' && DEMO_CODE_PATTERN.test(message.demoCode)) {
        socket.telemetry.demoCode = message.demoCode;
      }
    }
    let set = this.subscribers.get(orderId);
    if (!set) {
      set = new Set();
      this.subscribers.set(orderId, set);
    }
    set.add(socket);
    await this.traced('OrderStatusStream/subscribe', () => this.sendSnapshot(socket, orderId));
  }

  /**
   * The subscriber's first paint, and the answer it keeps if the worker
   * never advances the order (I11's freeze included).
   */
  async sendSnapshot(socket, orderId) {
    let status = null;
    const lookupStarted = Date.now();
    try {
      status = await this.getStatus(orderId);
    } catch (err) {
      if (socket.telemetry) socket.telemetry.snapshotFailed = true;
      this.logger?.warn({ err, orderId }, 'Order status stream: snapshot lookup failed');
    }
    const snapshotLookupMs = Date.now() - lookupStarted;
    if (socket.telemetry) socket.telemetry.snapshotLookupMs = snapshotLookupMs;
    try {
      const attributes = {
        orderId,
        snapshotLookupMs,
        snapshotFailed: socket.telemetry?.snapshotFailed ?? false,
      };
      if (socket.telemetry?.demoCode) attributes.demoCode = socket.telemetry.demoCode;
      this.newrelic.addCustomAttributes(attributes);
    } catch { /* attributes are best-effort */ }
    this.send(socket, orderId, status ?? 'pending', 'snapshot');
  }

  /** Called by the worker wiring for every order it advanced. */
  publish(orderId, status) {
    const set = this.subscribers.get(String(orderId));
    if (!set) return;
    for (const socket of set) {
      if (socket.readyState === WebSocket.OPEN && socket.telemetry) {
        socket.telemetry.pushesSent += 1;
        socket.telemetry.firstPushAt ??= Date.now();
      }
      this.send(socket, String(orderId), status, 'push', set.size);
    }
  }

  /**
   * @param kind 'snapshot' (the answer to a subscribe) or 'push' (a
   *             worker advance) - telemetry only, not on the wire.
   */
  send(socket, orderId, status, kind = 'push', subscribers = 1) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'status', orderId, status }));
    const telemetry = socket.telemetry;
    if (!telemetry) return;
    const now = Date.now();
    telemetry.messagesSent += 1;
    telemetry.firstStatus ??= status;
    telemetry.lastStatus = status;
    telemetry.lastSentAt = now;
    try {
      const attributes = {
        orderId,
        status,
        kind,
        subscribers,
        msSinceSubscribe: telemetry.subscribedAt != null ? now - telemetry.subscribedAt : 0,
      };
      if (telemetry.demoCode) attributes.demoCode = telemetry.demoCode;
      this.newrelic.recordCustomEvent('OrderStreamPush', attributes);
    } catch { /* telemetry must never break the stream */ }
  }

  unsubscribeAll(socket) {
    for (const [orderId, set] of this.subscribers) {
      set.delete(socket);
      if (set.size === 0) this.subscribers.delete(orderId);
    }
  }

  close() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const socket of this.wss.clients) socket.terminate();
    this.wss.close();
    this.subscribers.clear();
  }
}

module.exports = OrderStatusStream;
