import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MenuComponent } from './menu';
import { CartService } from '../../services/cart.service';
import { CustomerService } from '../../services/customer.service';
import {
  cartItem,
  createAppStubs,
  menuItem,
  restaurant,
  TEST_CUSTOMER,
} from '../../testing/app-stubs.spec';

const ANGULAR_PIZZA = restaurant({
  menuItems: [
    menuItem({ id: 'margherita', name: 'Margherita', price: 9.5, category: 'Pizza' }),
    menuItem({ id: 'pepperoni', name: 'Pepperoni', price: 10.25, category: 'Pizza' }),
    menuItem({ id: 'coffee', name: 'Coffee', price: 2.95, category: 'Beverages' }),
  ],
});

describe('MenuComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let cart: CartService;
  let stubs: ReturnType<typeof createAppStubs>;

  beforeEach(async () => {
    stubs = createAppStubs();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'menu/:restaurantName', component: MenuComponent },
          { path: '**', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...stubs.providers,
        {
          provide: CustomerService,
          useValue: { address: TEST_CUSTOMER.address, customer: () => TEST_CUSTOMER },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    cart = TestBed.inject(CartService);
    spyOn(console, 'error'); // the component logs load failures
    harness = await RouterTestingHarness.create();
  });

  /** Open /menu/angular_pizza and answer the menu request. */
  async function openMenu(respond: (request: ReturnType<HttpTestingController['expectOne']>) => void) {
    const component = await harness.navigateByUrl('/menu/angular_pizza', MenuComponent);
    respond(http.expectOne('/api/restaurant/by-name/angular_pizza'));
    harness.detectChanges();
    return component;
  }
  const loaded = () => openMenu((request) => request.flush(ANGULAR_PIZZA));
  const page = () => harness.routeNativeElement as HTMLElement;
  const itemCards = () => [...page().querySelectorAll('.menu-item-card')] as HTMLElement[];

  it('loads the restaurant named in the URL and groups its menu by category', async () => {
    const component = await loaded();
    expect(page().querySelector('h1')!.textContent).toContain('Angular Pizza');
    expect(component.getCategoryKeys()).toEqual(['Pizza', 'Beverages']);
    expect(component.menuCategories()['Pizza'].length).toBe(2);
    expect(itemCards().length).toBe(3);
  });

  it('reports menu_viewed with the restaurant once the menu arrives', async () => {
    await loaded();
    expect(stubs.funnel.track).toHaveBeenCalledWith('menu_viewed', {
      restaurant: 'Angular Pizza',
      cuisine: 'pizza',
      itemCount: 3,
    });
  });

  it('adds a clicked item to the cart, shows the cart bar and reports add_to_cart', async () => {
    await loaded();
    expect(page().querySelector('.cart-bar')).toBeNull();

    itemCards()[0].click(); // Margherita
    harness.detectChanges();

    expect(cart.totalItems()).toBe(1);
    expect(cart.totalPrice()).toBe(9.5);
    expect(page().querySelector('.cart-bar')!.textContent).toContain('$9.50');
    expect(stubs.funnel.track).toHaveBeenCalledWith('add_to_cart', {
      restaurant: 'Angular Pizza',
      item: 'Margherita',
      price: 9.5,
      cartItems: 1,
      cartTotal: 9.5,
    });
  });

  it('keeps a running cart total across several items', async () => {
    const component = await loaded();
    component.addToCart(ANGULAR_PIZZA.menuItems![0]);
    component.addToCart(ANGULAR_PIZZA.menuItems![1]);
    expect(stubs.funnel.track).toHaveBeenCalledWith(
      'add_to_cart',
      jasmine.objectContaining({ item: 'Pepperoni', cartItems: 2, cartTotal: 19.75 }),
    );
  });

  it('refuses items while the cart holds another restaurant, and reports nothing', async () => {
    cart.addToCart(cartItem({ restaurant: restaurant({ id: 'other', name: 'Curry Up' }) }));
    await loaded();

    itemCards()[0].click();
    harness.detectChanges();

    expect(cart.totalItems()).toBe(1);
    expect(page().querySelector('.alert-warning')!.textContent).toContain('Curry Up');
    expect(stubs.funnel.track).not.toHaveBeenCalledWith('add_to_cart', jasmine.anything());
  });

  it('shows an error instead of a menu when the request fails', async () => {
    await openMenu((request) =>
      request.flush('boom', { status: 500, statusText: 'Server Error' }),
    );
    expect(page().querySelector('.alert-danger')!.textContent).toContain(
      'Failed to load restaurant menu',
    );
    expect(itemCards().length).toBe(0);
    expect(stubs.funnel.track).not.toHaveBeenCalledWith('menu_viewed', jasmine.anything());
  });
});
