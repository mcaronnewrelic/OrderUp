import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';

import { Router } from '@angular/router';
import { OrderService } from '../../services/order.service';
import { CustomerService } from '../../services/customer.service';
import { Order } from '../../models/order.model';
import { HeaderComponent } from '../header/header';
import { NrCalloutComponent } from '../nr-callout/nr-callout';
import { NrCheckComponent } from '../nr-check/nr-check';
import { DemoIdentityService } from '../../services/demo-identity.service';
import { MissionProgressService } from '../../services/mission-progress.service';
import { OrderStatusService, ORDER_STAGES } from '../../services/order-status.service';
import { OrderTrackerComponent } from '../order-tracker/order-tracker';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [HeaderComponent, NrCalloutComponent, NrCheckComponent, OrderTrackerComponent],
  templateUrl: './orders.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./orders.css']
})
export class OrdersComponent implements OnInit {
  // Scoped to this visitor's lookups: the lookup request carries the
  // demoCode, and the server stamps the transaction with
  // userID = 'user_' + the code normalised (spec section 2, Mission 4) -
  // supplied to the callout as the <userId> token.
  readonly ordersNrql =
    "SELECT timestamp, userID, operation, duration FROM Transaction WHERE operation = 'get_orders_by_phone' AND userID = '<userId>' SINCE 1 day ago";

  readonly socketNrql =
    "SELECT timestamp, actionName, event, status, previousStatus, transport, msSinceTracked, closeCode, reason, orderId FROM PageAction WHERE appName = 'OrderUp' AND feature = 'order_tracker' AND demoCode = '<code>' SINCE 1 day ago";

  protected orderStatus = inject(OrderStatusService);

  orders = signal<Order[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Computed properties for filtering and display
  sortedOrders = computed(() => {
    return [...this.orders()].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  constructor(
    private orderService: OrderService,
    private customerService: CustomerService,
    public router: Router,
    private identity: DemoIdentityService,
    private progress: MissionProgressService
  ) {}

  /** The userID the server derives from this visitor's code, for the Find query. */
  get lookupTokens(): Record<string, string> {
    const userId = 'user_' + this.identity.code().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return { userId };
  }

  ngOnInit() {
    // Check if customer has completed their information
    const customer = this.customerService.customer();
    
    if (!customer.phone) {
      this.router.navigate(['/customer']);
      return;
    }

    this.loadOrders();
  }

  loadOrders() {
    this.loading.set(true);
    this.error.set(null);

    const customer = this.customerService.customer();
    const phone = customer.phone;

    // Orders are looked up by the (sample) phone number only: email is not
    // collected anywhere in the demo, so there is nothing real to look up.
    if (phone) {
      this.loadOrdersByPhone(phone);
    } else {
      this.error.set('No customer information available');
      this.loading.set(false);
    }
  }

  private loadOrdersByPhone(phone: string) {
    this.orderService.getOrdersByCustomerPhone(phone, this.identity.code()).subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
        // Looking the order up again is Mission 4's Try (spec section 2).
        this.progress.markTried('mission-4');
      },
      error: (err) => {
        console.error('Error loading orders by phone:', err);
        this.error.set('Failed to load orders');
        this.loading.set(false);
      }
    });
  }

  /** True for the order the live tracker (and the header pill) is following. */
  isTracked(order: Order): boolean {
    return String(order.id) === this.orderStatus.trackedOrderId();
  }

  /** The freshest status we have: live for the tracked order, else the API's. */
  statusOf(order: Order): string {
    return (this.isTracked(order) && this.orderStatus.status()) || order.status;
  }

  isFinished(order: Order): boolean {
    return ['delivered', 'cancelled'].includes(this.statusOf(order));
  }

  /** Start following this order live (WebSocket, with the polling fallback). */
  trackLive(order: Order) {
    this.orderStatus.track(String(order.id), order.restaurantName);
  }

  getStatusDisplayName(status: string): string {
    if (status === 'cancelled') return 'Cancelled';
    return ORDER_STAGES.find((stage) => stage.key === status)?.label ?? status;
  }

  getStatusClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      'pending': 'status-pending',
      'preparing': 'status-preparing',
      'out_for_delivery': 'status-ready',
      'delivered': 'status-delivered',
      'cancelled': 'status-cancelled'
    };
    return statusClasses[status] || 'status-pending';
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  navigateToRestaurant(restaurantId: string) {
    // This would need the restaurant name slug, but for now we'll navigate to restaurants page
    this.router.navigate(['/restaurants']);
  }

  reorder(order: Order) {
    // For now, just navigate to the restaurant
    this.navigateToRestaurant(order.restaurantId);
  }
}