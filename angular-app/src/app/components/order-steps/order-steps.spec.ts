import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderStepsComponent } from './order-steps';

describe('OrderStepsComponent', () => {
  let fixture: ComponentFixture<OrderStepsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(step: number) {
    fixture = TestBed.createComponent(OrderStepsComponent);
    fixture.componentRef.setInput('step', step);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (element: HTMLElement, selector: string) =>
    [...element.querySelectorAll(selector + ' .order-step-label')].map((label) =>
      label.textContent!.trim(),
    );

  it('shows the five stages of placing an order', () => {
    expect(labels(render(1), '.order-step')).toEqual([
      'Your details',
      'Restaurant',
      'Menu',
      'Checkout',
      'On its way',
    ]);
  });

  it('marks the stages before the current one as done', () => {
    const element = render(4);
    expect(labels(element, '.order-step.done')).toEqual(['Your details', 'Restaurant', 'Menu']);
    expect(labels(element, '.order-step.current')).toEqual(['Checkout']);
    expect(element.querySelector('[aria-current="step"]')!.textContent).toContain('Checkout');
  });

  it('links back to the completed stages that have a page of their own', () => {
    const links = [...render(4).querySelectorAll('a.order-step-dot')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual(['/customer', '/restaurants']);
  });

  it('offers no links on the first stage', () => {
    expect(render(1).querySelectorAll('a.order-step-dot').length).toBe(0);
  });
});
