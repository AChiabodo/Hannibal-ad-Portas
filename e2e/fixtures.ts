/**
 * The test every spec in this directory runs on (ticket E4).
 *
 * It is Playwright's own `test` with one fixture added: a page watched from the
 * moment it is opened, which attaches the page's account of itself — boot report,
 * camera, the Match's snapshot and state hash, console, errors and DOM — when a
 * test fails, and does nothing at all when it passes. `diagnostics.ts` says what
 * is collected and why it beats a screenshot.
 *
 * The fixture is automatic, so a spec opts in by importing `test` from here and
 * nothing else: a browser test nobody wrote a diagnosis for is a test whose
 * failure costs an afternoon.
 */
import { test as base, expect, type TestInfo } from '@playwright/test';
import { watchPage, type WatchedPage } from './diagnostics';

export { expect };

/** The fixture a spec may ask for when it wants to read the evidence itself. */
export interface Diagnostics {
  readonly spqr: WatchedPage;
}

export const test = base.extend<Diagnostics>({
  spqr: [
    async ({ page }, use: (watched: WatchedPage) => Promise<void>, testInfo: TestInfo) => {
      const watched = watchPage(page);
      await use(watched);

      // Only a failure needs an explanation. A passing test that attached its
      // whole state would bury the failing one in the report.
      if (testInfo.status === testInfo.expectedStatus) return;

      await watched.attach(testInfo);
    },
    { auto: true },
  ],
});
