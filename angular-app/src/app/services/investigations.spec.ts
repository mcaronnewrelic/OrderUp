import { INVESTIGATIONS, InvestigationDef } from './investigations';

const bySlug = (slug: string): InvestigationDef =>
  INVESTIGATIONS.find((def) => def.slug === slug)!;

describe('investigation definitions', () => {
  it('give every checkpoint a unique id within its investigation', () => {
    for (const def of INVESTIGATIONS) {
      const ids = def.checkpoints.map((cp) => cp.questionId);
      expect(new Set(ids).size).withContext(def.slug).toBe(ids.length);
    }
  });

  it('have six checkpoints each, as the Investigations page promises', () => {
    for (const def of INVESTIGATIONS) {
      expect(def.checkpoints.length).withContext(def.slug).toBe(6);
    }
  });

  it('can always be answered: the key is one of the offered options', () => {
    for (const def of INVESTIGATIONS) {
      for (const cp of def.checkpoints) {
        const where = `${def.slug} / ${cp.questionId}`;
        if (cp.kind === 'choice') {
          expect(cp.options).withContext(where).toContain(cp.answer as string);
        } else if (cp.kind === 'multi') {
          for (const answer of cp.answer as string[]) {
            expect(cp.options).withContext(where).toContain(answer);
          }
        } else if (cp.kind === 'number') {
          expect(typeof cp.answer).withContext(where).toBe('number');
        }
      }
    }
  });

  it('use only placeholders the callout resolves, or the trace id the student pastes', () => {
    for (const def of INVESTIGATIONS) {
      for (const cp of def.checkpoints) {
        const tokens = (cp.nrql ?? '').match(/<[a-zA-Z]+>/g) ?? [];
        for (const token of tokens) {
          expect(['<code>', '<userId>', '<requestId>'])
            .withContext(`${def.slug} / ${cp.questionId}`)
            .toContain(token);
        }
      }
    }
  });
});

/**
 * The numbers in "One page, a dozen calls" are measured from the running
 * app (see server/order-queries.test.js): a menu call runs 2 database
 * calls; an order runs 7 that never change plus 1 per cart item.
 */
describe('"One page, a dozen calls" evidence', () => {
  const def = bySlug('one-page-a-dozen-calls');
  const checkpoint = (id: string) => def.checkpoints.find((cp) => cp.questionId === id)!;

  // Regression: the browser agent labels a menu request with the page the
  // visitor was on when it started (the restaurant list), so filtering on
  // pageUrl LIKE '%/menu/%' returned nothing.
  it('finds the menu request by its URL, not by the page it was made from', () => {
    const nrql = checkpoint('menu-api-calls').nrql!;
    expect(nrql).toContain('FROM AjaxRequest');
    expect(nrql).toContain("requestUrl LIKE '%/api/restaurant%'");
    expect(nrql).not.toContain('pageUrl');
  });

  // Only a sample of traces keep their spans, so the counts that students
  // must read come from the transaction itself, which is always recorded.
  it('reads the database call counts from transactions, not from sampled spans', () => {
    for (const id of ['menu-db-queries', 'order-db-queries']) {
      const nrql = checkpoint(id).nrql!;
      expect(nrql).toContain('FROM Transaction');
      expect(nrql).toContain('databaseCallCount');
      expect(nrql).not.toContain('FROM Span');
      expect(nrql).not.toContain('PASTE_TRACE_ID');
    }
  });

  it('scopes the order query to the visitor, since orders carry a demoCode', () => {
    expect(checkpoint('order-db-queries').nrql).toContain("demoCode = '<code>'");
  });

  it('expects 2 calls for a menu and 11 for a 4-item order (7 fixed + 4 inserts)', () => {
    expect(checkpoint('menu-db-queries').answer).toBe(2);
    const order = checkpoint('order-db-queries');
    const fixed = 7;
    const items = 4;
    expect(order.answer).toBe(fixed + items);
    expect(order.tolerance).toBeGreaterThanOrEqual(1); // an armed slow-order investigation adds one
  });

  it('names the order-item insert as the one statement that repeats', () => {
    expect(checkpoint('repeating-queries').answer).toBe('Insert the order item row');
  });
});
