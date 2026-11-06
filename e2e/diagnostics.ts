/**
 * What a failing browser test leaves behind, so that it can be diagnosed without
 * a picture (ticket E4).
 *
 * A screenshot of a canvas is the least useful artefact a browser test can
 * produce: a tile drawn in the wrong place and a tile that never drew look the
 * same, and neither says *which* tick, *which* Squad or *which* Command was
 * wrong. So every spec in this directory runs against `test` from `fixtures.ts`,
 * which watches the page from the moment it is opened and — only when the test
 * fails — writes down what the page said about itself:
 *
 * - the boot report: which renderer, and whether the page booted at all;
 * - the camera and the viewport, as the page describes them;
 * - the snapshot: the tick, the result, the state hash, what the Faction knows,
 *   what the interface is showing and every Command applied;
 * - the console, the page's errors and any request that failed;
 * - the DOM, as text, which is where a failed boot puts its Italian sentence.
 *
 * The state hash is the part that makes this evidence rather than a log: two runs
 * that disagree on a pixel and agree on the hash are a rendering question, and two
 * that disagree on the hash are a rules question — and the answer is already
 * narrowed to a tick before anyone looks at the code.
 *
 * Collecting is separated from attaching so that it can be *tested*: a passing
 * test can ask what the evidence would have been, which is the only way to know
 * that the evidence is there when a failing one needs it.
 */
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';

/** One page's account of itself: what it booted, what it believes, and what it said. */
export interface Diagnosis {
  /** Where the page was when the test failed. */
  readonly url: string;
  /** The boot report, or why reading it failed. */
  readonly boot: unknown;
  /** The camera and the viewport, or why reading them failed. */
  readonly view: unknown;
  /** The snapshot of the Match, or why reading it failed. */
  readonly state: unknown;
  /** Everything the page logged, in order, with its level. */
  readonly console: readonly string[];
  /** Uncaught errors and failed requests: the things a page cannot log by itself. */
  readonly errors: readonly string[];
  /** The document as text, so a failed boot's message is readable. */
  readonly dom: string;
}

/** A page watched for the evidence a failure would need. */
export interface WatchedPage {
  /** What the page would say about itself if the test failed now. */
  diagnosis(): Promise<Diagnosis>;
  /** Writes that account where a failing run keeps its evidence. */
  attach(testInfo: TestInfo): Promise<void>;
}

/**
 * Starts watching a page: its console, its uncaught errors and its failed
 * requests from here on.
 *
 * The three listeners are cheap and always on, because the interesting message is
 * almost always one that was logged before the test knew it was in trouble.
 */
export function watchPage(page: Page): WatchedPage {
  const logged: string[] = [];
  const errors: string[] = [];

  page.on('console', (message) => {
    logged.push(`[${message.type()}] ${message.text()}`);
  });

  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.stack ?? error.message}`);
  });

  page.on('requestfailed', (request) => {
    errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`.trim());
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    errors.push(`[http ${String(response.status())}] ${response.url()}`);
  });

  return {
    async diagnosis(): Promise<Diagnosis> {
      // One more round trip before anything is read. Console messages arrive on
      // their own channel, so a line logged just before the failure can still be
      // in flight when the teardown asks what the page said — and the line just
      // before a failure is usually the one worth having.
      await page.evaluate(() => undefined).catch(() => undefined);

      const hooks = await readHooks(page);

      return {
        url: page.url(),
        boot: hooks.boot,
        view: hooks.view,
        state: hooks.state,
        console: [...logged],
        errors: [...errors],
        dom: await readDom(page),
      };
    },

    async attach(testInfo: TestInfo): Promise<void> {
      const account = await this.diagnosis();

      // Written into the test's own output directory and then attached by path,
      // rather than attached from memory: a path is a file a CI run uploads, an
      // editor opens and a terminal can read, and the Playwright report links it.
      // Memory-only attachments reach the JSON reporter and little else.
      await keep(testInfo, 'spqr-diagnosis.json', JSON.stringify(account, null, 2), 'application/json');
      await keep(
        testInfo,
        'spqr-console.log',
        [...account.console, ...account.errors].join('\n'),
        'text/plain',
      );
      await keep(testInfo, 'spqr-page.html', account.dom, 'text/html');
    },
  };
}

/** One piece of evidence: a file in the test's output directory, and an attachment in the report. */
async function keep(
  testInfo: TestInfo,
  name: string,
  body: string,
  contentType: string,
): Promise<void> {
  const path = testInfo.outputPath(name);

  await writeFile(path, body, 'utf8');
  await testInfo.attach(name, { path, contentType });
}

/**
 * The page's own report of itself, read through its hooks.
 *
 * Every field is read defensively and every failure is *reported* rather than
 * thrown: this runs on the way out of a test that has already failed, and the
 * diagnosis must never replace the failure it was called to explain. A page that
 * never booted has no hooks to ask, and that is the answer.
 */
async function readHooks(page: Page): Promise<{ boot: unknown; view: unknown; state: unknown }> {
  try {
    return await page.evaluate(() => {
      const hooks = window.__SPQR;
      if (hooks === undefined || hooks === null) return { boot: 'no hooks published', view: null, state: null };

      return {
        boot: hooks.boot,
        view: hooks.view?.describe() ?? null,
        state: hooks.game?.state() ?? null,
      };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return { boot: `unreadable: ${reason}`, view: null, state: null };
  }
}

/** The document as text, which is where a failed boot puts the sentence that says why. */
async function readDom(page: Page): Promise<string> {
  try {
    return await page.content();
  } catch (error) {
    return `unreadable: ${error instanceof Error ? error.message : String(error)}`;
  }
}
