import { Injectable, inject } from '@angular/core';
import { NewRelicService } from './newrelic.service';

/**
 * The ordering funnel, as browser PageActions.
 *
 * Each stage of placing an order sends one addPageAction, so the whole
 * journey can be charted with NRQL's funnel() - and the client-side steps
 * that never reach the server (filtering, adding to the cart) are visible
 * at all. The numbered stages are the funnel; the un-numbered actions
 * are side events. The progress bar the visitor sees
 * (OrderStepsComponent) advances through the same journey.
 *
 * Every action carries funnel = 'ordering', plus the session's demoCode
 * and enduser.id, which the agent adds on its own.
 */
export const FUNNEL_STEPS = {
  restaurants_viewed: 1,
  menu_viewed: 2,
  add_to_cart: 3,
  checkout_started: 4,
  order_placed: 5,
} as const;

export type FunnelAction =
  | keyof typeof FUNNEL_STEPS
  | 'restaurant_filter_applied'
  | 'cart_item_removed';

/** The funnel() query behind the "ordering funnel" callout. */
export const ORDERING_FUNNEL_NRQL =
  "SELECT funnel(session, WHERE actionName = 'restaurants_viewed' AS 'Browsed restaurants', WHERE actionName = 'menu_viewed' AS 'Opened a menu', WHERE actionName = 'add_to_cart' AS 'Added to cart', WHERE actionName = 'checkout_started' AS 'Started checkout', WHERE actionName = 'order_placed' AS 'Placed the order') FROM PageAction WHERE appName = 'OrderUp' AND funnel = 'ordering' SINCE 1 day ago";

@Injectable({ providedIn: 'root' })
export class FunnelService {
  private newRelic = inject(NewRelicService);

  track(
    action: FunnelAction,
    attributes: Record<string, string | number | boolean> = {},
  ): void {
    const step = (FUNNEL_STEPS as Record<string, number>)[action];
    this.newRelic.addPageAction(action, {
      ...attributes,
      funnel: 'ordering',
      ...(step ? { funnelStep: step } : {}),
    });
  }
}
