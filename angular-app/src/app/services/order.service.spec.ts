import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the demoCode with a phone lookup so the server can tag the transaction', () => {
    service.getOrdersByCustomerPhone('(503) 555-0186', 'OU-AB12').subscribe();
    const request = http.expectOne((req) => req.url === '/api/orders/customer/phone/(503)%20555-0186');
    expect(request.request.params.get('demoCode')).toBe('OU-AB12');
    request.flush([]);
  });

  it('omits the demoCode when none is given', () => {
    service.getOrdersByCustomerPhone('555-0100').subscribe();
    const request = http.expectOne('/api/orders/customer/phone/555-0100');
    expect(request.request.params.has('demoCode')).toBeFalse();
    request.flush([]);
  });
});
