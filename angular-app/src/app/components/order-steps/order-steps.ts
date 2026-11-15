import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';

interface OrderStep {
  label: string;
  icon: string;
  link?: string;
}

/**
 * The ordering progress bar shown across the purchase flow. It advances
 * through the same journey FunnelService reports as PageActions, so the
 * visitor can see where they are in the funnel() they will query.
 */
@Component({
  selector: 'app-order-steps',
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="order-steps" aria-label="Order progress">
      @for (s of steps; track s.label; let i = $index) {
        <li
          class="order-step"
          [class.done]="i + 1 < step"
          [class.current]="i + 1 === step"
          [attr.aria-current]="i + 1 === step ? 'step' : null"
        >
          @if (s.link && i + 1 < step) {
            <a class="order-step-dot" [routerLink]="s.link" [attr.aria-label]="'Back to ' + s.label">
              <i class="fas fa-check"></i>
            </a>
          } @else {
            <span class="order-step-dot">
              <i [class]="i + 1 < step ? 'fas fa-check' : s.icon"></i>
            </span>
          }
          <span class="order-step-label">{{ s.label }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .order-steps {
      display: flex;
      list-style: none;
      margin: 1.25rem auto 1.75rem;
      padding: 0;
      max-width: 720px;
    }
    .order-step {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      color: var(--ou-muted);
      font-size: 0.8rem;
      font-weight: 600;
      text-align: center;
    }
    /* connector to the previous step */
    .order-step + .order-step::before {
      content: '';
      position: absolute;
      top: 1.05rem;
      right: 50%;
      width: 100%;
      height: 3px;
      background: var(--ou-line);
      transition: background 0.4s ease;
    }
    .order-step.done + .order-step::before {
      background: var(--ou-primary);
    }
    .order-step-dot {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 50%;
      border: 2px solid var(--ou-line);
      background: #fff;
      color: var(--ou-muted);
      font-size: 0.85rem;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    .order-step.done .order-step-dot {
      background: var(--ou-primary);
      border-color: var(--ou-primary);
      color: #fff;
    }
    .order-step.current .order-step-dot {
      border-color: var(--ou-primary);
      color: var(--ou-primary);
      box-shadow: 0 0 0 5px rgba(194, 65, 12, 0.14);
    }
    .order-step.current,
    .order-step.done {
      color: var(--ou-ink);
    }
    @media (max-width: 575.98px) {
      .order-step-label { font-size: 0.68rem; }
    }
  `,
})
export class OrderStepsComponent {
  /** 1-based index of the stage the visitor is on. */
  @Input({ required: true }) step!: number;

  readonly steps: OrderStep[] = [
    { label: 'Your details', icon: 'fas fa-user', link: '/customer' },
    { label: 'Restaurant', icon: 'fas fa-store', link: '/restaurants' },
    { label: 'Menu', icon: 'fas fa-utensils' },
    { label: 'Checkout', icon: 'fas fa-credit-card' },
    { label: 'On its way', icon: 'fas fa-truck' },
  ];
}
