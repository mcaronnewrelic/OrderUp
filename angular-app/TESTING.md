# Testing the OrderUp front end

```bash
cd angular-app
npm run test:ci     # one headless run, for a quick check or CI
npm test            # watch mode: re-runs as you edit, with a browser report
```

To run one file while you work on it:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include="src/app/components/menu/menu.spec.ts"
```

The server has its own tests (`node --test server/` from the repo root).

## What is worth testing here

This site is a teaching demo, so the things that must not silently break are
the ordering flow and the telemetry it produces. Test behaviour a student or
instructor would notice, not implementation details.

| Worth a test | Example in this repo |
| --- | --- |
| **Each step of the ordering flow does its job** | adding an item changes the cart and its total (`menu.spec.ts`); a purchase posts the right order and moves on (`checkout.spec.ts`) |
| **The telemetry the lessons depend on** | every funnel stage sends its PageAction with the right attributes (`funnel.service.spec.ts`, and the page specs); the callout's NRQL names the same events the code sends |
| **Rules and edge cases** | one restaurant per cart (`cart.service.spec.ts`); no second order while one is in flight; an empty cart sends no `checkout_started` |
| **What happens when something fails** | the menu request errors (`menu.spec.ts`); the WebSocket drops and the tracker falls back to polling (`order-status.service.spec.ts`) |
| **Guards** | a visitor with no address is sent back to the customer page |
| **Every bug you fix** | a test that fails without the fix - see the tests marked `// Regression:` |

Not worth a test: that a component "should create", exact CSS, wording that
changes often, or Angular itself.

## How the specs are put together

- **`src/app/testing/app-stubs.spec.ts`** holds stand-ins for the services
  nearly every page pulls in through the header and the callouts, plus small
  builders for restaurants, menu items and cart items. A page spec starts with
  `const stubs = createAppStubs()` and spreads `stubs.providers`, then asserts
  on `stubs.funnel.track`, `stubs.missions.markTried` and so on.
- **HTTP** is faked with `provideHttpClientTesting()`: the test answers each
  request itself (`http.expectOne('/api/restaurant').flush([...])`), including
  with errors.
- **Routes with parameters** (the menu page) use `RouterTestingHarness`.
- **Time and sockets** (`order-status.service.spec.ts`) use `jasmine.clock()`
  and a hand-driven fake `WebSocket`, so reconnect delays and the 20-second
  linger run instantly.
- **Telemetry** is never sent from tests: `NewRelicService` / `FunnelService`
  are replaced by spies and the test checks what *would* have been sent.

## Two habits that keep the suite healthy

1. Tests run in random order. Anything a test writes to `localStorage` it must
   put back (see `app.spec.ts`), or an unrelated test fails one run in three.
2. When you change what a page sends to New Relic, change its spec in the same
   commit - the spec is the record of what the lesson expects to find.
