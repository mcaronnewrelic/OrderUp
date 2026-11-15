import { Component, ChangeDetectionStrategy, DestroyRef, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { HeaderComponent } from '../header/header';
import { NrConfigService, ScenarioKind, ArmedScenario } from '../../nr-config';

/**
 * Instructor controls (moved off How It Works 2026-11-01 at Michael's
 * request): arming the planted-failure scenario and the
 * investigations. Deliberately NOT linked from the menu - the route
 * is /instructor, for the instructor to bookmark - so students do not
 * stumble into changing what is armed. The endpoints behind these
 * buttons are unauthenticated by design (a teaching demo); the
 * separate page is about discoverability, not security.
 */
@Component({
  selector: 'app-instructor',
  imports: [RouterModule, FormsModule, DatePipe, HeaderComponent],
  templateUrl: './instructor.html',
  changeDetection: ChangeDetectionStrategy.Eager
})
export class InstructorComponent {
  protected readonly NrConfigService = NrConfigService;

  readonly restaurantNames = signal<string[]>([]);
  readonly itemNames = signal<string[]>([]);
  readonly selectedKind = signal<ScenarioKind>('order-item');
  readonly selectedTarget = signal<string>('');
  /** How often the wait-events schedule runs when armed, in seconds. */
  readonly waitInterval = signal(180);
  readonly waitIntervals = [
    { seconds: 60, label: 'every minute' },
    { seconds: 180, label: 'every 3 minutes' },
    { seconds: 300, label: 'every 5 minutes' },
    { seconds: 600, label: 'every 10 minutes' },
  ];

  constructor(
    private http: HttpClient,
    public nrConfig: NrConfigService
  ) {
    // Current scenario + investigation state, and the pick-lists for
    // arming a different scenario.
    this.nrConfig.refreshDemoState();
    this.nrConfig.refreshInvestigationState();
    this.nrConfig.refreshWaitEventsState();
    // An episode takes ~20 seconds, so keep the status current while the page is open.
    const poll = setInterval(() => this.nrConfig.refreshWaitEventsState(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(poll));
    this.http.get<{ name: string; menuItems?: { name: string }[] }[]>('/api/restaurant').subscribe({
      next: restaurants => {
        this.restaurantNames.set(restaurants.map(r => r.name));
        this.itemNames.set([...new Set(restaurants.flatMap(r => (r.menuItems || []).map(m => m.name)))]);
        this.selectedTarget.set(this.targetsForKind()[0] || '');
      },
      error: () => {}
    });
  }

  currentDescription(): string | null {
    const state = this.nrConfig.demoState();
    if (!state?.armed) return null;
    return NrConfigService.describeScenario({ ...state.armed, source: state.source as ArmedScenario['source'] });
  }

  targetsForKind(): string[] {
    return this.selectedKind() === 'order-item' ? this.itemNames() : this.restaurantNames();
  }

  onKindChange(kind: ScenarioKind) {
    this.selectedKind.set(kind);
    this.selectedTarget.set(this.targetsForKind()[0] || '');
  }

  armWaitEvents() {
    this.nrConfig.armWaitEvents(this.waitInterval());
  }

  /** "Right now" for the wait-events generator, in plain words. */
  waitEventsSummary(): string {
    const state = this.nrConfig.waitEventsState();
    if (!state) return 'loading...';
    if (!state.databaseAvailable) return 'unavailable: the server is running without a database';
    const how = state.source === 'manual' ? 'instructor override' : state.source === 'env' ? 'server environment' : 'not armed';
    if (!state.enabled) return `off (${how})`;
    const every = state.intervalSeconds % 60 === 0 ? `${state.intervalSeconds / 60} min` : `${state.intervalSeconds} s`;
    return `on, an episode every ${every} (${how})`;
  }

  armSelected() {
    if (this.selectedTarget()) {
      this.nrConfig.armScenario(this.selectedKind(), this.selectedTarget());
    }
  }
}
