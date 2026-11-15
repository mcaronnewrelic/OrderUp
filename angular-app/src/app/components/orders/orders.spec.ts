import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OrdersComponent } from './orders';
import { CartService } from '../../services/cart.service';
import { CustomerService } from '../../services/customer.service';
import { OrderService } from '../../services/order.service';
import { Order } from '../../models/order.model';
import { createAppStubs, TEST_CUSTOMER } from '../../testing/app-stubs.spec';

function order(overrides: Partial<Order>): Order {
  return {
    id: 'o1',
    orderNumber: '1001',
    restaurantId: 'r1',
    restaurantName: 'Angular Pizza',
    status: 'delivered',
    totalAmount: 21.95,
    deliveryAddress: TEST_CUSTOMER.address,
    deliveryFee: 0,
    taxAmount: 0,
    createdAt: new Date('2026-11-01T18:00:00Z'),
    updatedAt: new Date('2026-11-01T18:30:00Z'),
    items: [
      { id: 'i1', menuItemId: 'margherita', itemName: 'Margherita', quantity: 2, unitPrice: 9.5 },
    ],
    ...overrides,
  };
}

const DELIVERED = order({ id: 'o1', status: 'delivered' });
const IN_KITCHEN = order({
  id: 'o2',
  orderNumber: '1002',
  restaurantName: 'Curry Up',
  status: 'preparing',
  createdAt: new Date('2026-11-02T18:00:00Z'),
});

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let stubs: ReturnType<typeof createAppStubs>;
  let orderService: { getOrdersByCustomerPhone: jasmine.Spy };
  let customer: { phone: string };

  beforeEach(async () => {
    stubs = createAppStubs();
    customer = { ...TEST_CUSTOMER };
    orderService = {
      getOrdersByCustomerPhone: jasmine
        .createSpy('getOrdersByCustomerPhone')
        .and.returnValue(of([DELIVERED, IN_KITCHEN])),
    };
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        provideRouter([]),
        ...stubs.providers,
        { provide: OrderService, useValue: orderService },
        { provide: CustomerService, useValue: { customer: () => customer } },
        {
          provide: CartService,
          useValue: { totalItems: () => 0, totalPrice: () => 0 },
        },
      ],
    }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    spyOn(console, 'error');
  });

  function render() {
    fixture = TestBed.createComponent(OrdersComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const orderCards = () =>
    [...fixture.nativeElement.querySelectorAll('.order-card')] as HTMLElement[];
  const currentStage = (card: HTMLElement) =>
    card.querySelector('.tracker-step.current .tracker-label')?.textContent?.trim();
  const badge = (card: HTMLElement) =>
    card.querySelector('.status-badge')!.textContent!.trim();

  it('looks orders up by the customer phone and lists the newest first', () => {
    render();
    expect(orderService.getOrdersByCustomerPhone).toHaveBeenCalledWith(TEST_CUSTOMER.phone);
    expect(
      orderCards().map((card) => card.querySelector('.restaurant-name')!.textContent!.trim()),
    ).toEqual(['Curry Up', 'Angular Pizza']);
    expect(stubs.missions.markTried).toHaveBeenCalledWith('mission-4');
  });

  it('draws the stage tracker on every order from the status the API returned', () => {
    render();
    const [kitchen, delivered] = orderCards();
    expect(currentStage(kitchen)).toBe('Preparing');
    expect(badge(kitchen)).toBe('Preparing');
    expect(currentStage(delivered)).toBe('Delivered');
    expect(kitchen.querySelectorAll('.tracker-step').length).toBe(4);
  });

  it('follows the live status for the order the tracker is watching', () => {
    stubs.orderStatus.trackedOrderId.set('o2');
    stubs.orderStatus.status.set('out_for_delivery'); // newer than the API's "preparing"
    stubs.orderStatus.live.set(true);
    render();

    const [kitchen] = orderCards();
    expect(currentStage(kitchen)).toBe('Out for delivery');
    expect(badge(kitchen)).toBe('Out for delivery');
    expect(kitchen.querySelector('.tracker-note')!.textContent).toContain('Updating live');

    stubs.orderStatus.status.set('delivered');
    fixture.detectChanges();
    expect(currentStage(orderCards()[0])).toBe('Delivered');
  });

  it('offers "Track live" only on unfinished orders that are not already tracked', () => {
    render();
    const [kitchen, delivered] = orderCards();
    expect(delivered.querySelector('.track-live-btn')).toBeNull();

    (kitchen.querySelector('.track-live-btn') as HTMLButtonElement).click();
    expect(stubs.orderStatus.track).toHaveBeenCalledWith('o2', 'Curry Up');

    stubs.orderStatus.trackedOrderId.set('o2');
    fixture.detectChanges();
    expect(orderCards()[0].querySelector('.track-live-btn')).toBeNull();
  });

  it('shows the empty state when there are no orders', () => {
    orderService.getOrdersByCustomerPhone.and.returnValue(of([]));
    render();
    expect(fixture.nativeElement.textContent).toContain('No Orders Yet');
  });

  it('shows an error with a retry when the lookup fails', () => {
    orderService.getOrdersByCustomerPhone.and.returnValue(
      throwError(() => new Error('down')),
    );
    render();
    expect(fixture.nativeElement.textContent).toContain('Unable to Load Orders');

    orderService.getOrdersByCustomerPhone.and.returnValue(of([DELIVERED]));
    (fixture.nativeElement.querySelector('.error-state button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(orderCards().length).toBe(1);
  });

  it('sends a visitor with no phone number back to the customer page', () => {
    customer.phone = '';
    render();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/customer']);
    expect(orderService.getOrdersByCustomerPhone).not.toHaveBeenCalled();
  });
});
