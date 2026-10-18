/**
 * The plumbing the game page and the Atelier page share.
 *
 * Both pages do the same three things around a boot — find where to mount, tell
 * whoever is watching that it worked, and say so when it did not — and both were
 * going to say it in their own words. Saying it once here is not an abstraction
 * for its own sake: a page that failed to publish its hooks would be a page the
 * browser test cannot inspect, and that is a failure worth having in one place.
 *
 * The Italian on a failed boot is a placeholder in the same sense the title plate
 * is: player text belongs in the string table with its English fallback path
 * (PLAN §2.4), which B7 builds.
 */
import type { SpqrDebugHooks } from './debug.ts';

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
  const message = error instanceof Error ? error.message : String(error);
  const mount = document.getElementById(mountId);

  if (mount !== null) mount.textContent = `Avvio fallito: ${message}`;
  window.__SPQR = { boot: { booted: false, error: message }, view: null, atelier: null };
  document.body.dataset.spqrBooted = 'failed';
  console.error(error);
}
