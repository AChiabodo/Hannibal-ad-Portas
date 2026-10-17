import { bootRenderer } from './render/boot';
import type { BootReport } from './debug';

/**
 * Boots the game: renderer up, one frame drawn, debug hooks published.
 *
 * A Match is not part of this ticket — this is the frame B2 builds on, and the
 * page Playwright drives to prove WebGL works in headless CI.
 */
async function boot(): Promise<BootReport> {
  const mount = document.getElementById('app');
  if (mount === null) throw new Error('index.html has no #app element');

  const render = await bootRenderer(mount);
  return { booted: true, render };
}

/**
 * The one line of Italian on screen so far. Player-facing text belongs in the
 * string table with its English fallback path (PLAN §2.4), which B7 builds;
 * until then this literal is the placeholder.
 */
function bootFailureText(message: string): string {
  return `Avvio fallito: ${message}`;
}

boot()
  .then((report) => {
    window.__SPQR = { boot: report };
    document.body.dataset.spqrBooted = 'true';
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const mount = document.getElementById('app');

    if (mount !== null) mount.textContent = bootFailureText(message);
    window.__SPQR = { boot: { booted: false, error: message } };
    document.body.dataset.spqrBooted = 'failed';
    console.error(error);
  });
