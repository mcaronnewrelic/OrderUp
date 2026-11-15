import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { CheckoutComponent } from './checkout';
import { CartService } from '../../services/cart.service';
import { CustomerService } from '../../services/customer.service';
import {
  cartItem,
  createAppStubs,
  menuItem,
  TEST_CUSTOMER,
} from '../../testing/app-stubs.spec';

describe('CheckoutComponent', () => {
  let fixture: ComponentFixture<CheckoutComponent>;
  let http: HttpTestingController;
  let cart: CartService;
  let router: Router;
  let stubs: ReturnType<typeof createAppStubs>;

  beforeEach(async () => {
    stubs = createAppStubs();
    await TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...stubs.providers,
        {
          provide: CustomerService,
          useValue: {
            address: TEST_CUSTOMER.address,
            customer: () => TEST_CUSTOMER,
            updateCustomer: () => {},
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    cart = TestBed.inject(CartService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(console, 'log'); // the form validator logs on every check
    spyOn(console, 'error');
  });

  /** Two Margheritas and a coffee from Angular Pizza: $21.95. */
  function fillCart() {
    cart.addToCart(cartItem({ quantity: 2 }));
    cart.addToCart(
      cartItem({ menuItem: menuItem({ id: 'coffee', name: 'Coffee', price: 2.95 }) }),
    );
  }

  function render() {
    fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('reports checkout_started with the cart summary on arrival', () => {
    fillCart();
    render();
    expect(stubs.funnel.track).toHaveBeenCalledWith('checkout_started', {
      restaurant: 'Angular Pizza',
      itemCount: 3,
      cartTotal: 21.95,
    });
    expect(fixture.nativeElement.textContent).toContain('$21.95');
  });

  it('shows an empty-cart message, and no funnel step, when there is nothing to buy', () => {
    render();
    expect(fixture.nativeElement.textContent).toContain('Your cart is empty');
    expect(stubs.funnel.track).not.toHaveBeenCalled();
  });

  it('places the order, reports order_placed, empties the cart and moves on', async () => {
    fillCart();
    const component = render();

    const purchase = component.purchase();
    const request = http.expectOne('/api/order');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(
      jasmine.objectContaining({
        demoCode: 'OU-TEST',
        total: 21.95,
        restaurant: { id: 'r1', name: 'Angular Pizza' },
        deliverTo: TEST_CUSTOMER,
      }),
    );
    expect(request.request.body.items).toEqual([
      { id: 'margherita', name: 'Margherita', price: 9.5, qty: 2 },
      { id: 'coffee', name: 'Coffee', price: 2.95, qty: 1 },
    ]);
    request.flush({ orderId: 'order-1', requestId: 'req_1' });
    await purchase;

    expect(stubs.funnel.track).toHaveBeenCalledWith('order_placed', {
      restaurant: 'Angular Pizza',
      itemCount: 3,
      orderTotal: 21.95,
      orderId: 'order-1',
      requestId: 'req_1',
    });
    expect(cart.totalItems()).toBe(0);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/thank-you'],
      jasmine.objectContaining({
        state: jasmine.objectContaining({ orderId: 'order-1', requestId: 'req_1' }),
      }),
    );
    expect(component.submitting()).toBeFalse();
  });

  it('keeps the cart and reports no order when the purchase fails', async () => {
    spyOn(window, 'alert');
    fillCart();
    const component = render();

    const purchase = component.purchase();
    http
      .expectOne('/api/order')
      .flush('nope', { status: 500, statusText: 'Server Error' });
    await purchase;

    expect(window.alert).toHaveBeenCalled();
    expect(cart.totalItems()).toBe(3);
    expect(stubs.funnel.track).not.toHaveBeenCalledWith('order_placed', jasmine.anything());
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.submitting()).toBeFalse();
  });

  it('does not send a second order while the first is still in flight', () => {
    fillCart();
    const component = render();
    void component.purchase();
    void component.purchase();
    expect(http.match('/api/order').length).toBe(1);
  });

  it('reports cart_item_removed when an item is taken out', () => {
    fillCart();
    const component = render();
    component.removeItem('coffee');
    expect(cart.totalItems()).toBe(2);
    expect(stubs.funnel.track).toHaveBeenCalledWith('cart_item_removed', {
      restaurant: 'Angular Pizza',
      item: 'Coffee',
      cartItems: 2,
    });
  });

  // Regression: this used to navigate by restaurant id, which the menu route cannot load.
  it('goes back to the menu by the restaurant name slug', () => {
    fillCart();
    render().goBackToMenu();
    expect(router.navigate).toHaveBeenCalledWith(['/menu', 'angular_pizza']);
  });
});
