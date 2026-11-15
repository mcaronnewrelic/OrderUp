import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderTrackerComponent } from './order-tracker';

describe('OrderTrackerComponent', () => {
  let fixture: ComponentFixture<OrderTrackerComponent>;

  function render(inputs: { status?: string | null; live?: boolean; tracking?: boolean }) {
    fixture = TestBed.createComponent(OrderTrackerComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (element: HTMLElement, selector: string) =>
    [...element.querySelectorAll(selector + ' .tracker-label')].map((label) =>
      label.textContent!.trim(),
    );

  it('always shows the four stages in lifecycle order', () => {
    expect(labels(render({ status: null }), '.tracker-step')).toEqual([
      'Order received',
      'Preparing',
      'Out for delivery',
      'Delivered',
    ]);
  });

  it('marks earlier stages done and the current one current', () => {
    const element = render({ status: 'out_for_delivery' });
    expect(labels(element, '.tracker-step.done')).toEqual(['Order received', 'Preparing']);
    expect(labels(element, '.tracker-step.current')).toEqual(['Out for delivery']);
  });

  it('highlights nothing before the first status arrives', () => {
    const element = render({ status: null, tracking: true });
    expect(element.querySelectorAll('.tracker-step.done, .tracker-step.current').length).toBe(0);
    expect(element.querySelector('.tracker-note')!.textContent).toContain('Checking for updates');
  });

  it('says so when the status is arriving live', () => {
    const note = render({ status: 'preparing', live: true, tracking: true }).querySelector(
      '.tracker-note',
    )!;
    expect(note.textContent).toContain('Updating live');
  });

  it('celebrates a delivered order', () => {
    const element = render({ status: 'delivered', live: true });
    expect(labels(element, '.tracker-step.done').length).toBe(3);
    expect(element.querySelector('.tracker-note')!.textContent).toContain('Delivered');
  });

  it('replaces the stages with a notice for a cancelled order', () => {
    const element = render({ status: 'cancelled' });
    expect(element.querySelector('.tracker-steps')).toBeNull();
    expect(element.querySelector('.tracker-cancelled')!.textContent).toContain('cancelled');
  });

  it('names a status it does not know rather than guessing a stage', () => {
    const element = render({ status: 'confirmed' });
    expect(element.querySelectorAll('.tracker-step.current').length).toBe(0);
    expect(element.querySelector('.tracker-note')!.textContent).toContain('Status: confirmed');
  });

  it('moves on when the status input changes', () => {
    const element = render({ status: 'pending' });
    fixture.componentRef.setInput('status', 'preparing');
    fixture.detectChanges();
    expect(labels(element, '.tracker-step.current')).toEqual(['Preparing']);
  });
});
