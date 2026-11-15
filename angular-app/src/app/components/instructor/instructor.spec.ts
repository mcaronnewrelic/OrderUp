import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { InstructorComponent } from './instructor';
import { DemoWaitEventsState, NrConfigService } from '../../nr-config';
import { createAppStubs } from '../../testing/app-stubs.spec';

function waitState(overrides: Partial<DemoWaitEventsState> = {}): DemoWaitEventsState {
  return {
    source: 'none',
    enabled: false,
    databaseAvailable: true,
    intervalSeconds: 180,
    episodeSeconds: 20,
    running: false,
    episodes: 0,
    nextEpisodeAt: null,
    lastEpisode: null,
    ...overrides,
  };
}

describe('InstructorComponent: database wait events', () => {
  let fixture: ComponentFixture<InstructorComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    // The real NrConfigService (it owns the wait-events calls); the rest are the usual stubs.
    const stubs = createAppStubs();
    const providers = stubs.providers.filter(
      (provider) => (provider as { provide?: unknown }).provide !== NrConfigService,
    );
    await TestBed.configureTestingModule({
      imports: [InstructorComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...providers,
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy(); // stops the page's polling
  });

  /** Render the page and answer the requests it makes on load. */
  function render(state: DemoWaitEventsState = waitState()) {
    fixture = TestBed.createComponent(InstructorComponent);
    fixture.detectChanges();
    http.match('/api/nr-config').forEach((request) => request.flush({}));
    http.match('/api/demo/failures').forEach((request) => request.flush({ armed: null, source: 'none' }));
    http.match('/api/demo/investigations').forEach((request) => request.flush({ armed: null, source: 'none' }));
    http.match('/api/restaurant').forEach((request) => request.flush([]));
    http.expectOne('/api/demo/wait-events').flush(state);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const section = (page: HTMLElement) => page.querySelector('#wait-events') as HTMLElement;
  const button = (page: HTMLElement, id: string) => page.querySelector(`#${id}`) as HTMLButtonElement;

  it('explains the generator and shows that it is off', () => {
    const text = section(render()).textContent!;
    expect(text).toContain('Right now:');
    expect(text).toContain('off (not armed)');
    expect(text).toContain('never touches orders or customers');
  });

  it('describes an armed schedule, who armed it and when the next episode is due', () => {
    const page = render(
      waitState({ enabled: true, source: 'manual', intervalSeconds: 300, nextEpisodeAt: '2026-11-15T18:00:00.000Z' }),
    );
    const text = section(page).textContent!;
    expect(text).toContain('on, an episode every 5 min (instructor override)');
    expect(text).toContain('next episode');
  });

  it('shows an episode in progress, and the last result', () => {
    const page = render(
      waitState({
        enabled: true,
        running: true,
        episodes: 4,
        lastEpisode: {
          startedAt: '2026-11-15T17:50:00.000Z',
          finishedAt: '2026-11-15T17:50:22.000Z',
          durationMs: 22000,
          ok: true,
          waiters: 2,
        },
      }),
    );
    const text = section(page).textContent!;
    expect(text).toContain('episode running');
    expect(text).toContain('4 so far');
    expect(text).toContain('22 s, 2 waiting sessions');
  });

  it('says plainly when the last episode did not run, and why', () => {
    const page = render(
      waitState({
        episodes: 1,
        lastEpisode: {
          startedAt: '2026-11-15T17:50:00.000Z',
          finishedAt: '2026-11-15T17:50:01.000Z',
          durationMs: 1000,
          ok: false,
          error: 'connection refused',
        },
      }),
    );
    expect(section(page).textContent).toContain('did not run: connection refused');
  });

  it('warns that it needs a database when the server has none', () => {
    const page = render(waitState({ databaseAvailable: false }));
    expect(section(page).textContent).toContain('the server is running without a database');
  });

  it('arms the schedule with the chosen interval', () => {
    const page = render();
    const select = page.querySelector('#waitInterval') as HTMLSelectElement;
    select.selectedIndex = 2; // every 5 minutes
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    button(page, 'arm-wait-events').click();
    const request = http.expectOne('/api/demo/wait-events');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ mode: 'on', intervalSeconds: 300 });
    request.flush(waitState({ enabled: true, source: 'manual', intervalSeconds: 300 }));
    fixture.detectChanges();
    expect(section(page).textContent).toContain('on, an episode every 5 min');
  });

  it('runs one episode now without arming anything', () => {
    const page = render();
    button(page, 'run-wait-events').click();
    const request = http.expectOne('/api/demo/wait-events');
    expect(request.request.body).toEqual({ action: 'run-now' });
    request.flush(waitState({ running: true }));
    fixture.detectChanges();
    expect(section(page).textContent).toContain('episode running');
    expect(section(page).textContent).toContain('off (not armed)');
  });

  it('disarms, and clears the override', () => {
    const page = render(waitState({ enabled: true, source: 'manual' }));

    button(page, 'disarm-wait-events').click();
    const disarm = http.expectOne('/api/demo/wait-events');
    expect(disarm.request.body).toEqual({ mode: 'off' });
    disarm.flush(waitState({ source: 'manual', enabled: false }));

    button(page, 'clear-wait-events').click();
    const clear = http.expectOne('/api/demo/wait-events');
    expect(clear.request.method).toBe('DELETE');
    clear.flush(waitState());
  });
});
