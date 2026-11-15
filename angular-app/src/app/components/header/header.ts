import { Component, ChangeDetectionStrategy, effect, inject, signal, untracked } from '@angular/core';

import { RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { NrConfigService } from '../../nr-config';
import { DemoIdentityService } from '../../services/demo-identity.service';
import { OrderStatusService, ORDER_STAGES } from '../../services/order-status.service';
import { AgentReachabilityService } from '../../services/agent-reachability.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './header.css'
})
export class HeaderComponent {
  protected readonly NrConfigService = NrConfigService;
  showCartDropdown = false;
  showHelpDropdown = false;
  showMobileMenu = false;

  protected readonly ORDER_STAGES = ORDER_STAGES;

  constructor(
    public cartService: CartService,
    public nrConfig: NrConfigService,
    public demoIdentity: DemoIdentityService,
    public orderStatus: OrderStatusService
  ) {
    // Bump the cart icon whenever the item count goes up.
    let previous = this.cartService.totalItems();
    effect(() => {
      const count = this.cartService.totalItems();
      if (count > previous) {
        untracked(() => this.cartBump.set(true));
        setTimeout(() => this.cartBump.set(false), 450);
      }
      previous = count;
    });

    // Behind the scenes is about finding your own data in New Relic, so
    // that is the moment to check this browser can send any (ad blockers
    // and DNS filters often stop the browser agent without a sound).
    effect(() => {
      if (this.nrConfig.showCallouts()) this.agentReachability.check();
    });
  }

  protected readonly agentReachability = inject(AgentReachabilityService);

  protected readonly cartBump = signal(false);

  get cartItemCount() {
    return this.cartService.totalItems();
  }

  get cartTotal() {
    return this.cartService.totalPrice();
  }

  toggleCartDropdown() {
    this.showCartDropdown = !this.showCartDropdown;
    this.showHelpDropdown = false; // Close other dropdowns
  }

  closeCartDropdown() {
    this.showCartDropdown = false;
  }

  toggleHelpDropdown() {
    this.showHelpDropdown = !this.showHelpDropdown;
    this.showCartDropdown = false; // Close other dropdowns
  }

  closeHelpDropdown() {
    this.showHelpDropdown = false;
  }

  toggleMobileMenu() {
    this.showMobileMenu = !this.showMobileMenu;
  }

  closeMobileMenu() {
    this.showMobileMenu = false;
  }
}
