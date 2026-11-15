import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App shell', () => {
  // The shell runs the real identity and mission services, which write to
  // localStorage. Put it back as it was, so specs that run afterwards
  // (in random order) start from the storage they expect.
  let storageBefore: Record<string, string>;

  beforeEach(() => {
    storageBefore = { ...localStorage };
  });

  afterEach(() => {
    localStorage.clear();
    for (const [key, value] of Object.entries(storageBefore)) {
      localStorage.setItem(key, value);
    }
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders the mission strip above the routed page', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-mission-strip .mission-strip')).not.toBeNull();
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelectorAll('.mission-tick').length).toBe(5);
  });
});
