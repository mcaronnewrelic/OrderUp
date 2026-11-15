import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NrConfigService } from '../../nr-config';
import { INVESTIGATIONS } from '../../services/investigations';
import { CartService } from '../../services/cart.service';
import { createAppStubs } from '../../testing/app-stubs.spec';
import { InvestigationsPageComponent } from './investigations-page';

describe('InvestigationsPageComponent', () => {
  function render(armedSlug: string | null) {
    const stubs = createAppStubs();
    TestBed.configureTestingModule({
      imports: [InvestigationsPageComponent],
      providers: [
        provideRouter([]),
        ...stubs.providers,
        {
          provide: NrConfigService,
          useValue: {
            showCallouts: stubs.showCallouts,
            toggleCallouts: () => {},
            armedScenario: () => null,
            armedInvestigation: () => (armedSlug ? { slug: armedSlug, source: 'manual' } : null),
            claimAccountNote: () => false,
            nrqlUrl: () => null,
            browserErrorsUrl: () => null,
          },
        },
        { provide: CartService, useValue: { totalItems: () => 0, totalPrice: () => 0 } },
      ],
    });
    const fixture = TestBed.createComponent(InvestigationsPageComponent);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-investigation')].map((el) => ({
      title: el.querySelector('h3')!.textContent!.replace('🔍', '').trim(),
      live: !!el.querySelector('.investigation-status.live'),
    }));
  }

  const titleOf = (slug: string) => INVESTIGATIONS.find((def) => def.slug === slug)!.title;

  it('lists every investigation', () => {
    expect(render(null).length).toBe(INVESTIGATIONS.length);
  });

  it('puts the investigations you can work on first, ahead of the ones that are not live', () => {
    const armed = INVESTIGATIONS.find((def) => def.live === 'armed' && def.slug !== INVESTIGATIONS[0].slug)!.slug;
    const cards = render(armed);
    const liveCount = INVESTIGATIONS.filter((def) => def.live === 'always').length + 1;

    expect(cards.slice(0, liveCount).every((card) => card.live)).toBeTrue();
    expect(cards.slice(liveCount).some((card) => card.live)).toBeFalse();
    expect(cards.map((card) => card.title)).toContain(titleOf(armed));
    expect(cards.findIndex((card) => card.title === titleOf(armed))).toBeLessThan(liveCount);
  });

  it('keeps the always-live investigation on top when nothing is armed', () => {
    const cards = render(null);
    const always = INVESTIGATIONS.filter((def) => def.live === 'always').map((def) => def.title);
    expect(cards.slice(0, always.length).map((card) => card.title).sort()).toEqual(always.sort());
  });
});
