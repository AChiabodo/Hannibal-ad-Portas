import { failBoot, publishHooks, requireMount } from './page.ts';
import { createAtelier } from './render/atelier.ts';

/**
 * Boots the Atelier: the whole generated catalogue, on one page, at several zoom
 * levels (PLAN §3).
 *
 * A separate page rather than a mode of the game page, because its whole value is
 * being a surface someone can open and a test can point at: `/atelier.html` shows
 * every glyph and every ramp, and publishes its geometry and pixel read-back on
 * `window.__SPQR` for whoever wants to check the art rather than look at it.
 */
async function boot(): Promise<void> {
  const atelier = await createAtelier(requireMount('app'));

  publishHooks({ boot: { booted: true, render: atelier.probe }, view: null, game: null, atelier });
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
