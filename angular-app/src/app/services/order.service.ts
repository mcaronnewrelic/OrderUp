import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Order } from '../models/order.model';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = '/api/orders';

  constructor(private http: HttpClient) {}

  /**
   * Get a specific order by ID
   */
  getOrderById(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.apiUrl}/${orderId}`);
  }

  /**
   * Get orders for a customer by their phone number (fallback). The
   * demoCode lets the server tag the lookup with the visitor's userID.
   */
  getOrdersByCustomerPhone(phone: string, demoCode?: string): Observable<Order[]> {
    const params = demoCode ? new HttpParams().set('demoCode', demoCode) : undefined;
    return this.http.get<Order[]>(`${this.apiUrl}/customer/phone/${encodeURIComponent(phone)}`, { params });
  }
}