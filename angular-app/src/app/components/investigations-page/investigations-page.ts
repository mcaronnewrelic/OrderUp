import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { HeaderComponent } from '../header/header';
import { InvestigationComponent } from '../investigation/investigation';
import { INVESTIGATIONS } from '../../services/investigations';
import { NrConfigService } from '../../nr-config';

/**
 * The Investigations page (spec section 11, moved off How It Works
 * 2026-11-01 at Michael's request). Always available - not gated on
 * Behind the scenes. An investigation's checkpoints open only while
 * that investigation is live: the instructor arms one (on the
 * unlisted Instructor page), or I6 arms itself with its burst.
 */
@Component({
  selector: 'app-investigations-page',
  imports: [HeaderComponent, InvestigationComponent],
  templateUrl: './investigations-page.html',
  changeDetection: ChangeDetectionStrategy.Eager
})
export class InvestigationsPageComponent {
  private config = inject(NrConfigService);

  /**
   * The investigations you can work on right now come first (the armed one,
   * and any that are always live); the rest keep their order below, so the
   * live case is never buried under "not live right now" cards.
   */
  protected readonly investigations = computed(() => {
    const armed = this.config.armedInvestigation()?.slug;
    const isLive = (def: (typeof INVESTIGATIONS)[number]) => def.live === 'always' || def.slug === armed;
    return [...INVESTIGATIONS].sort((a, b) => Number(isLive(b)) - Number(isLive(a)));
  });
}
