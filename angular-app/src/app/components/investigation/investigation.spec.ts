import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionProgressService } from '../../services/mission-progress.service';
import { InvestigationDef } from '../../services/investigations';
import { createAppStubs } from '../../testing/app-stubs.spec';
import { InvestigationComponent } from './investigation';

/** A small always-live investigation, so no arming is needed. */
const DEF: InvestigationDef = {
  slug: 'test-case',
  title: 'A test case',
  summary: 'Summary',
  live: 'always',
  liveNote: 'Always on',
  caseClosed: 'Done',
  checkpoints: [
    {
      questionId: 'first',
      title: 'First',
      prompt: 'Do the first thing',
      nrql: 'SELECT 1',
      kind: 'choice',
      question: 'First question?',
      options: ['Right', 'Wrong'],
      answer: 'Right',
      reveal: 'First reveal',
    },
    {
      questionId: 'second',
      title: 'Second',
      prompt: 'Do the second thing',
      kind: 'choice',
      question: 'Second question?',
      options: ['Yes', 'No'],
      answer: 'Yes',
      reveal: 'Second reveal',
    },
  ],
};

describe('InvestigationComponent', () => {
  let fixture: ComponentFixture<InvestigationComponent>;
  let stubs: ReturnType<typeof createAppStubs>;
  let solvedIds: Set<string>;

  beforeEach(async () => {
    stubs = createAppStubs();
    solvedIds = new Set();
    // A progress store whose "solved" set the test controls.
    stubs.missions.isSolved = (_mission: string, question: string) =>
      solvedIds.has(question);
    await TestBed.configureTestingModule({
      imports: [InvestigationComponent],
      providers: stubs.providers,
    }).compileComponents();
    // The checks record their answers through the progress service.
    TestBed.inject(MissionProgressService);
  });

  function render() {
    fixture = TestBed.createComponent(InvestigationComponent);
    fixture.componentRef.setInput('def', DEF);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const currentHeading = (el: HTMLElement) =>
    el.querySelector('.checkpoint.current h4')?.textContent?.trim();

  // Regression: with "Behind the scenes" off, a live checkpoint showed its
  // prompt but no question, so a student could never open the next one and
  // nothing on the page said why.
  it('never leaves a live checkpoint without a way to answer it', () => {
    const el = render();
    expect(stubs.showCallouts()).toBeFalse();
    expect(el.querySelector('.nr-check')).toBeNull();
    const note = el.querySelector('.checkpoint-hidden-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('Behind the scenes');
  });

  it('switches Behind the scenes on from the notice, which brings the question', () => {
    const el = render();
    (el.querySelector('.checkpoint-hidden-note button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(stubs.showCallouts()).toBeTrue();
    expect(el.querySelector('.checkpoint-hidden-note')).toBeNull();
    expect(el.querySelector('.nr-check')!.textContent).toContain('First question?');
  });

  it('shows the question directly, with no notice, when Behind the scenes is on', () => {
    stubs.showCallouts.set(true);
    const el = render();
    expect(el.querySelector('.checkpoint-hidden-note')).toBeNull();
    expect(el.querySelector('.nr-check')).not.toBeNull();
  });

  it('opens only the first checkpoint until it is solved', () => {
    stubs.showCallouts.set(true);
    const el = render();
    expect(currentHeading(el)).toBe('Checkpoint 1 — First');
    expect(el.querySelectorAll('.checkpoint.locked').length).toBe(1);
    expect(el.querySelector('.checkpoint.locked')!.textContent).toContain('Checkpoint 2');
  });

  it('opens the next checkpoint once the one before it is solved', () => {
    stubs.showCallouts.set(true);
    solvedIds.add('first');
    const el = render();
    expect(el.querySelector('.checkpoint.solved')!.textContent).toContain('First reveal');
    expect(currentHeading(el)).toBe('Checkpoint 2 — Second');
    expect(el.querySelectorAll('.checkpoint.locked').length).toBe(0);
  });

  it('closes the case once every checkpoint is solved', () => {
    stubs.showCallouts.set(true);
    solvedIds.add('first');
    solvedIds.add('second');
    const el = render();
    expect(el.querySelector('.investigation-status.closed')).not.toBeNull();
    expect(el.querySelector('.investigation-case-closed')!.textContent).toContain('Done');
  });

  it('shows nothing to answer while the investigation is not live', () => {
    const el = TestBed.createComponent(InvestigationComponent);
    el.componentRef.setInput('def', { ...DEF, live: 'armed' }); // nothing is armed
    el.detectChanges();
    const root = el.nativeElement as HTMLElement;
    expect(root.querySelector('.not-live')).not.toBeNull();
    expect(root.querySelector('.checkpoint.current')).toBeNull();
    expect(root.querySelector('.nr-check')).toBeNull();
  });
});
