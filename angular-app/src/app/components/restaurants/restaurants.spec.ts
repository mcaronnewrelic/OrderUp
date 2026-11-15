import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RestaurantsComponent } from './restaurants';
import { CartService } from '../../services/cart.service';
import { CustomerService } from '../../services/customer.service';
import {
  createAppStubs,
  restaurant,
  TEST_CUSTOMER,
} from '../../testing/app-stubs.spec';

const RESTAURANTS = [
  restaurant({ id: '1', name: 'Angular Pizza', cuisine: 'pizza', rating: 5 }),
  restaurant({ id: '2', name: 'Pizza 76', cuisine: 'pizza', rating: 3 }),
  restaurant({ id: '3', name: 'Curry Up', cuisine: 'indian', rating: 4 }),
  restaurant({ id: '4', name: 'Little Prague', cuisine: 'czech/slovak', rating: 2 }),
];

describe('RestaurantsComponent', () => {
  let fixture: ComponentFixture<RestaurantsComponent>;
  let http: HttpTestingController;
  let stubs: ReturnType<typeof createAppStubs>;
  let customer: { address: string; customer: () => typeof TEST_CUSTOMER };

  beforeEach(async () => {
    stubs = createAppStubs();
    customer = { address: TEST_CUSTOMER.address, customer: () => TEST_CUSTOMER };
    await TestBed.configureTestingModule({
      imports: [RestaurantsComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...stubs.providers,
        { provide: CustomerService, useValue: customer },
        {
          provide: CartService,
          useValue: { totalItems: () => 0, totalPrice: () => 0 },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  /** Render the page and answer its restaurant-list request. */
  function render(restaurants = RESTAURANTS) {
    fixture = TestBed.createComponent(RestaurantsComponent);
    fixture.detectChanges();
    http.expectOne('/api/restaurant').flush(restaurants);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const cards = () =>
    [...fixture.nativeElement.querySelectorAll('.restaurant-card')] as HTMLElement[];
  const chips = () =>
    [...fixture.nativeElement.querySelectorAll('.cuisine-chip')] as HTMLButtonElement[];
  const names = () =>
    cards().map((card) => card.querySelector('.restaurant-name')!.textContent!.trim());

  it('lists every restaurant the API returned and reports the view', () => {
    render();
    expect(names()).toEqual(['Angular Pizza', 'Curry Up', 'Little Prague', 'Pizza 76']);
    expect(stubs.funnel.track).toHaveBeenCalledWith('restaurants_viewed', {
      resultCount: 4,
    });
  });

  it('offers only the cuisines that exist in the data, most common first', () => {
    const component = render();
    expect(component.cuisineOptions()).toEqual([
      { key: 'pizza', count: 2, label: 'Pizza' },
      { key: 'czech/slovak', count: 1, label: 'Czech/Slovak' },
      { key: 'indian', count: 1, label: 'Indian' },
    ]);
    expect(chips().length).toBe(3);
  });

  // Regression: the chips used to be a fixed list, so "Italian" matched nothing.
  it('never offers a cuisine chip that filters down to no restaurants', () => {
    const component = render();
    for (const option of component.cuisineOptions()) {
      component.toggleCuisine(option.key);
      expect(component.filteredRestaurants().length)
        .withContext(option.label)
        .toBeGreaterThan(0);
      component.toggleCuisine(option.key);
    }
  });

  it('filters by a cuisine chip and reports the filter as a PageAction', () => {
    render();
    stubs.funnel.track.calls.reset();

    chips()[0].click(); // Pizza
    fixture.detectChanges();
    expect(names()).toEqual(['Angular Pizza', 'Pizza 76']);
    expect(chips()[0].classList).toContain('active');
    expect(stubs.funnel.track).toHaveBeenCalledWith('restaurant_filter_applied', {
      filterType: 'cuisine',
      filterValue: 'pizza',
      selected: true,
      resultCount: 2,
    });

    chips()[0].click(); // and off again
    fixture.detectChanges();
    expect(cards().length).toBe(4);
    expect(stubs.funnel.track).toHaveBeenCalledWith(
      'restaurant_filter_applied',
      jasmine.objectContaining({ selected: false, resultCount: 4 }),
    );
  });

  it('filtering never asks the server for anything', () => {
    const component = render();
    component.toggleCuisine('indian');
    component.updateFilter('rating', 4);
    http.expectNone('/api/restaurant');
    expect(component.filteredRestaurants().map((r) => r.name)).toEqual(['Curry Up']);
  });

  it('sorts by rating, best first', () => {
    const component = render();
    component.updateFilter('sortBy', 'rating');
    component.updateFilter('sortAsc', false);
    fixture.detectChanges();
    expect(names()).toEqual(['Angular Pizza', 'Curry Up', 'Pizza 76', 'Little Prague']);
  });

  it('opens a restaurant menu by its name slug', () => {
    render();
    cards()[0].click();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([
      '/menu',
      'angular_pizza',
    ]);
  });

  it('counts a filter as trying Mission 2', () => {
    const component = render();
    component.toggleCuisine('pizza');
    expect(stubs.missions.markTried).toHaveBeenCalledWith('mission-2');
  });

  it('sends a visitor with no delivery address back to the customer page', () => {
    customer.address = '';
    fixture = TestBed.createComponent(RestaurantsComponent);
    fixture.detectChanges();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/customer']);
    http.expectNone('/api/restaurant');
  });
});
