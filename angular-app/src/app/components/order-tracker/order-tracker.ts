import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ORDER_STAGES } from '../../services/order-status.service';

const STAGE_ICONS: Record<string, string> = {
  pending: 'fas fa-receipt',
  preparing: 'fas fa-utensils',
  out_for_delivery: 'fas fa-bicycle',
  delivered: 'fas fa-flag-checkered',
};

/**
 * The stage-by-stage order tracker (received -> preparing -> out for
 * delivery -> delivered). Presentational only: it draws whatever status
 * it is given. The Thank You page and the tracked order on My Orders
 * feed it the live status from OrderStatusService; other orders on My
 * Orders feed it the status the API returned.
 */
@Component({
  selector: 'app-order-tracker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="order-tracker" aria-label="Order status">
      @if (status === 'cancelled') {
        <p class="tracker-cancelled">
          <i class="fas fa-ban"></i> This order was cancelled.
        </p>
      } @else {
        <ol class="tracker-steps">
          @for (stage of stages; track stage.key; let i = $index) {
            <li
              class="tracker-step"
              [class.done]="stageIndex > i"
              [class.current]="stageIndex === i"
              [attr.aria-current]="stageIndex === i ? 'step' : null"
            >
              <span class="tracker-dot"><i [class]="stage.icon"></i></span>
              <span class="tracker-label">{{ stage.label }}</span>
            </li>
          }
        </ol>
        <p class="tracker-note">
          @if (status === 'delivered') {
            Delivered — enjoy your meal!
          } @else if (stageIndex === -1 && status) {
            Status: {{ status }}
          } @else if (live) {
            <span class="tracker-live-dot" aria-hidden="true"></span>
            Updating live as the kitchen works — no need to refresh.
          } @else if (tracking) {
            Checking for updates…
          }
        </p>
      }
    </section>
  `,
  styleUrl: './order-tracker.css',
})
export class OrderTrackerComponent {
  /** The order's current status; null/undefined before the first answer. */
  @Input() status: string | null | undefined;
  /** True while a WebSocket (not the polling fallback) is feeding the status. */
  @Input() live = false;
  /** True when something is watching this order for changes at all. */
  @Input() tracking = false;

  readonly stages = ORDER_STAGES.map((stage) => ({
    ...stage,
    icon: STAGE_ICONS[stage.key],
  }));

  /** Index of the current stage, or -1 before the first status / for unknown statuses. */
  get stageIndex(): number {
    return this.stages.findIndex((stage) => stage.key === this.status);
  }
}
