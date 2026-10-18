/**
 * The plumbing the game page and the Atelier page share.
 *
 * Both pages do the same three things around a boot — find where to mount, tell
 * whoever is watching that it worked, and say so when it did not — and both were
 * going to say it in their own words. Saying it once here is not an abstraction
 * for its own sake: a page that failed to publish its hooks would be a page the
 * browser test cannot inspect, and that is a failure worth having in one place.
 *
 * The Italian on a failed boot is the string table's like every other word a
 * Player reads (PLAN §2.4): this module is the one place a page can fail before
 * its own interface exists, and it says so in the game's language.
 */
import type { SpqrDebugHooks } from './debug.ts';
import { message } from './ui/strings.ts';

/**
 * The element a page mounts its canvas in.
 *
 * @throws Error when the page has no such element: a page whose markup does not
 *   match its entry is a bug, and one worth seeing rather than working around.
 */
export function requireMount(id: string): HTMLElement {
  const mount = document.getElementById(id);
  if (mount === null) throw new Error(`the page has no #${id} element`);

  return mount;
}

/** Publishes the debug hooks and marks the body, which is how a test waits for boot. */
export function publishHooks(hooks: SpqrDebugHooks): void {
  window.__SPQR = hooks;
  document.body.dataset.spqrBooted = 'true';
}

/**
 * Reports a failed boot: on the page, on the hooks, and on the body's data
 * attribute, so a test fails with the message rather than with a timeout.
 */
export function failBoot(error: unknown, mountId: string): void {
  const reason = error instanceof Error ? error.message : String(error);
  const mount = document.getElementById(mountId);

  if (mount !== null) mount.textContent = message('ui.bootFailed', { message: reason });
  window.__SPQR = { boot: { booted: false, error: reason }, view: null, game: null, atelier: null };
  document.body.dataset.spqrBooted = 'failed';
  console.error(error);
}
