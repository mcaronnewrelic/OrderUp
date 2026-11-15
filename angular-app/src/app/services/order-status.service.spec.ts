import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { OrderStatusService } from './order-status.service';
import { NewRelicService } from './newrelic.service';

/** A WebSocket the test drives by hand: it opens, speaks and closes on cue. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static get latest() {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; wasClean: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  closedByClient = false;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closedByClient = true;
  }
  // --- what the "server" does ---
  open() {
    this.onopen?.();
  }
  push(status: string, orderId = '42') {
    this.onmessage?.({ data: JSON.stringify({ type: 'status', orderId, status }) });
  }
  drop(code = 1006) {
    this.onclose?.({ code, wasClean: false });
  }
}

describe('OrderStatusService', () => {
  const ACTIVE_ORDER_KEY = 'orderup-active-order';
  const DEMO_CODE_KEY = 'orderup-demo-code';
  let service: OrderStatusService;
  let http: HttpTestingController;
  let newRelic: jasmine.SpyObj<NewRelicService>;
  let realWebSocket: typeof WebSocket;
  let savedOrder: string | null;
  let savedCode: string | null;

  beforeEach(() => {
    savedOrder = localStorage.getItem(ACTIVE_ORDER_KEY);
    savedCode = localStorage.getItem(DEMO_CODE_KEY);
    localStorage.removeItem(ACTIVE_ORDER_KEY);
    localStorage.setItem(DEMO_CODE_KEY, 'OU-TEST');

    realWebSocket = window.WebSocket;
    FakeSocket.instances = [];
    (window as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
    jasmine.clock().install();

    newRelic = jasmine.createSpyObj('NewRelicService', ['addPageAction']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NewRelicService, useValue: newRelic },
      ],
    });
    service = TestBed.inject(OrderStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.dismiss();
    jasmine.clock().uninstall();
    window.WebSocket = realWebSocket;
    if (savedOrder === null) localStorage.removeItem(ACTIVE_ORDER_KEY);
    else localStorage.setItem(ACTIVE_ORDER_KEY, savedOrder);
    if (savedCode === null) localStorage.removeItem(DEMO_CODE_KEY);
    else localStorage.setItem(DEMO_CODE_KEY, savedCode);
  });

  /** Start tracking order 42 and answer the REST seed with `status`. */
  function track(status = 'pending') {
    service.track('42', 'Angular Pizza');
    http.expectOne('/api/orders/42').flush({ status });
    return FakeSocket.latest;
  }

  const connectionEvents = () =>
    newRelic.addPageAction.calls
      .allArgs()
      .filter(([action]) => action === 'order_tracker_connection')
      .map(([, attributes]) => (attributes as Record<string, unknown>)['event']);

  it('paints the first status from REST before the socket has said anything', () => {
    track('preparing');
    expect(service.status()).toBe('preparing');
    expect(service.stageIndex()).toBe(1);
    expect(service.statusLabel()).toBe('Preparing');
    expect(service.live()).toBeFalse();
    expect(service.pillVisible()).toBeTrue();
    expect(service.trackedOrderId()).toBe('42');
    expect(service.restaurantName()).toBe('Angular Pizza');
  });

  it('subscribes over the socket with the order id and the visitor demoCode', () => {
    const socket = track();
    expect(socket.url).toContain('/api/orders/stream');
    socket.open();
    expect(socket.sent).toEqual([{ type: 'subscribe', orderId: '42', demoCode: 'OU-TEST' }]);
    expect(service.live()).toBeTrue();
  });

  it('applies each pushed status and reports how it arrived', () => {
    const socket = track('pending');
    socket.open();
    socket.push('preparing');

    expect(service.status()).toBe('preparing');
    expect(newRelic.addPageAction).toHaveBeenCalledWith(
      'order_tracker_status',
      jasmine.objectContaining({
        status: 'pending',
        previousStatus: 'none',
        transport: 'rest',
        orderId: '42',
        feature: 'order_tracker',
      }),
    );
    expect(newRelic.addPageAction).toHaveBeenCalledWith(
      'order_tracker_status',
      jasmine.objectContaining({
        status: 'preparing',
        previousStatus: 'pending',
        transport: 'websocket',
      }),
    );
  });

  it('does not report a status it has already shown', () => {
    const socket = track('pending');
    socket.open();
    newRelic.addPageAction.calls.reset();
    socket.push('pending'); // the socket's snapshot repeats the REST seed
    expect(newRelic.addPageAction).not.toHaveBeenCalledWith(
      'order_tracker_status',
      jasmine.anything(),
    );
  });

  it('ignores pushes about somebody else\'s order', () => {
    const socket = track('pending');
    socket.open();
    socket.push('delivered', '99');
    expect(service.status()).toBe('pending');
  });

  it('reports an unexpected drop and reconnects with a growing delay', () => {
    const socket = track('preparing');
    socket.open();
    socket.drop(1006);

    expect(service.live()).toBeFalse();
    expect(newRelic.addPageAction).toHaveBeenCalledWith(
      'order_tracker_connection',
      jasmine.objectContaining({ event: 'closed', closeCode: 1006, lastStatus: 'preparing' }),
    );
    expect(newRelic.addPageAction).toHaveBeenCalledWith(
      'order_tracker_connection',
      jasmine.objectContaining({ event: 'reconnect', attempt: 1, delayMs: 1000 }),
    );

    expect(FakeSocket.instances.length).toBe(1);
    jasmine.clock().tick(1000);
    expect(FakeSocket.instances.length).toBe(2);
  });

  it('falls back to polling once the reconnects run out', () => {
    track('preparing').drop(); // never even opened
    jasmine.clock().tick(1000);
    FakeSocket.latest.drop();
    jasmine.clock().tick(2000);
    FakeSocket.latest.drop();
    jasmine.clock().tick(4000);
    FakeSocket.latest.drop(); // the third retry fails too

    expect(connectionEvents()).toContain('polling_fallback');
    expect(FakeSocket.instances.length).toBe(4);

    jasmine.clock().tick(10000);
    http.expectOne('/api/orders/42').flush({ status: 'out_for_delivery' });
    expect(service.status()).toBe('out_for_delivery');
    expect(newRelic.addPageAction).toHaveBeenCalledWith(
      'order_tracker_status',
      jasmine.objectContaining({ status: 'out_for_delivery', transport: 'rest' }),
    );
  });

  it('closes the channel on delivery and lets the pill linger before clearing', () => {
    const socket = track('out_for_delivery');
    socket.open();
    socket.push('delivered');

    expect(service.status()).toBe('delivered');
    expect(socket.closedByClient).toBeTrue();
    expect(service.live()).toBeFalse();
    expect(service.pillVisible()).toBeTrue();

    jasmine.clock().tick(20000);
    expect(service.pillVisible()).toBeFalse();
    expect(service.trackedOrderId()).toBeNull();
    expect(localStorage.getItem(ACTIVE_ORDER_KEY)).toBeNull();
    expect(service.status()).toBe('delivered'); // the page keeps its final status
  });

  it('remembers the tracked order so a page reload can resume it', () => {
    track();
    expect(JSON.parse(localStorage.getItem(ACTIVE_ORDER_KEY)!)).toEqual(
      jasmine.objectContaining({ orderId: '42', restaurantName: 'Angular Pizza' }),
    );
  });

  it('forgets everything on dismiss', () => {
    const socket = track();
    socket.open();
    service.dismiss();

    expect(socket.closedByClient).toBeTrue();
    expect(service.pillVisible()).toBeFalse();
    expect(service.trackedOrderId()).toBeNull();
    expect(localStorage.getItem(ACTIVE_ORDER_KEY)).toBeNull();
  });

  it('keeps tracking even when telemetry throws', () => {
    newRelic.addPageAction.and.throwError('agent blocked');
    const socket = track('pending');
    socket.open();
    socket.push('preparing');
    expect(service.status()).toBe('preparing');
  });
});
