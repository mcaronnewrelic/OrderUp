import { TestBed } from '@angular/core/testing';
import {
  FUNNEL_STEPS,
  FunnelService,
  ORDERING_FUNNEL_NRQL,
} from './funnel.service';
import { NewRelicService } from './newrelic.service';

describe('FunnelService', () => {
  let funnel: FunnelService;
  let newRelic: jasmine.SpyObj<NewRelicService>;

  beforeEach(() => {
    newRelic = jasmine.createSpyObj('NewRelicService', ['addPageAction']);
    TestBed.configureTestingModule({
      providers: [{ provide: NewRelicService, useValue: newRelic }],
    });
    funnel = TestBed.inject(FunnelService);
  });

  it('sends each funnel stage as a PageAction tagged with its step number', () => {
    funnel.track('add_to_cart', { item: 'Margherita', price: 9.5 });
    expect(newRelic.addPageAction).toHaveBeenCalledOnceWith('add_to_cart', {
      item: 'Margherita',
      price: 9.5,
      funnel: 'ordering',
      funnelStep: 3,
    });
  });

  it('numbers the five stages in the order a visitor reaches them', () => {
    expect(FUNNEL_STEPS).toEqual({
      restaurants_viewed: 1,
      menu_viewed: 2,
      add_to_cart: 3,
      checkout_started: 4,
      order_placed: 5,
    });
  });

  it('sends side events without a step number, so they stay out of the funnel', () => {
    funnel.track('restaurant_filter_applied', { filterType: 'cuisine' });
    expect(newRelic.addPageAction).toHaveBeenCalledOnceWith('restaurant_filter_applied', {
      filterType: 'cuisine',
      funnel: 'ordering',
    });
  });

  it('works with no attributes at all', () => {
    funnel.track('restaurants_viewed');
    expect(newRelic.addPageAction).toHaveBeenCalledOnceWith('restaurants_viewed', {
      funnel: 'ordering',
      funnelStep: 1,
    });
  });

  // The callout's query and the events must agree, or the funnel reads zero.
  it('queries every stage the service can send, in step order', () => {
    const positions = Object.keys(FUNNEL_STEPS).map((action) =>
      ORDERING_FUNNEL_NRQL.indexOf(`actionName = '${action}'`),
    );
    expect(positions.every((position) => position > 0)).toBeTrue();
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(ORDERING_FUNNEL_NRQL).toContain("funnel = 'ordering'");
  });
});
