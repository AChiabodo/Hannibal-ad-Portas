import { failBoot, publishHooks, requireMount } from './page.ts';
import { bootRenderer } from './render/boot.ts';

/**
 * Boots the game: the title plate up, one frame drawn through the camera, the
 * debug hooks published.
 *
 * A Match is not part of this page yet — B3 brings the theatre, and the plates
 * and camera the rest of the HUD is drawn with are what B2 put here.
 */
async function boot(): Promise<void> {
  const view = await bootRenderer(requireMount('app'));

  publishHooks({ boot: { booted: true, render: view.probe }, view, atelier: null });
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
