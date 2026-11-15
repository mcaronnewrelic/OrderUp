import { Provider, signal } from '@angular/core';
import { NrConfigService } from '../nr-config';
import { DemoIdentityService } from '../services/demo-identity.service';
import { FunnelService } from '../services/funnel.service';
import { MissionProgressService } from '../services/mission-progress.service';
import { OrderStatusService } from '../services/order-status.service';
import { CartItem, MenuItem, Restaurant } from '../models/restaurant.model';

/**
 * Shared stand-ins for the services almost every page pulls in through
 * the header and the "Behind the scenes" callouts. A page spec provides
 * these so it can concentrate on the page's own behaviour:
 *
 *   const stubs = createAppStubs();
 *   TestBed.configureTestingModule({ providers: [...stubs.providers] });
 *   ...
 *   expect(stubs.funnel.track).toHaveBeenCalledWith('menu_viewed', ...);
 *
 * (The file is named .spec.ts only so the app build leaves it out; it
 * holds no tests of its own.)
 */
export function createAppStubs() {
  /** Flip to true in a test to render the Behind-the-scenes callouts. */
  const showCallouts = signal(false);

  /** Records every funnel PageAction a page tries to send. */
  const funnel = { track: jasmine.createSpy('FunnelService.track') };

  const missions = {
    markTried: jasmine.createSpy('markTried'),
    markFound: jasmine.createSpy('markFound'),
    recordAttempt: jasmine.createSpy('recordAttempt'),
    isSolved: () => false,
    progress: () => ({ attempts: 0, solved: false }),
  };

  /** The live order tracker, with signals a test can set directly. */
  const orderStatus = {
    status: signal<string | null>(null),
    live: signal(false),
    restaurantName: signal<string | null>(null),
    pillVisible: signal(false),
    trackedOrderId: signal<string | null>(null),
    stageIndex: () => -1,
    statusLabel: () => '',
    track: jasmine.createSpy('OrderStatusService.track'),
    dismiss: jasmine.createSpy('OrderStatusService.dismiss'),
  };

  const providers: Provider[] = [
    {
      provide: NrConfigService,
      useValue: {
        showCallouts,
        toggleCallouts: () => showCallouts.update((on) => !on),
        armedScenario: () => null,
        armedInvestigation: () => null,
        claimAccountNote: () => false,
        nrqlUrl: () => null,
        browserErrorsUrl: () => null,
      },
    },
    { provide: DemoIdentityService, useValue: { code: () => 'OU-TEST' } },
    { provide: MissionProgressService, useValue: missions },
    { provide: OrderStatusService, useValue: orderStatus },
    { provide: FunnelService, useValue: funnel },
  ];

  return { showCallouts, funnel, missions, orderStatus, providers };
}

/** A sample customer who has filled in the landing page. */
export const TEST_CUSTOMER = {
  name: 'OU-TEST',
  phone: '(503) 555-0100',
  address: '100 SE Morrison St, Portland, OR 97200',
};

export function menuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'margherita',
    name: 'Margherita',
    description: 'Tomato, mozzarella, basil',
    price: 9.5,
    category: 'Pizza',
    ...overrides,
  };
}

export function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'r1',
    name: 'Angular Pizza',
    cuisine: 'pizza',
    price: 1,
    rating: 5,
    description: 'Home of the superheroic pizza!',
    ...overrides,
  };
}

export function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    restaurant: restaurant(),
    menuItem: menuItem(),
    quantity: 1,
    ...overrides,
  };
}
