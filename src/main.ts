import { failBoot, publishHooks, requireMount } from './page.ts';
import { bootRenderer } from './render/boot.ts';

/**
 * Boots the game: the theatre B1 generated, on one texture under B2's camera,
 * with the debug hooks published.
 *
 * A Match is not part of this page yet — B4 brings fog, C1 movement, C2 the
 * Squads a player commands — and what B3 puts here is the ground all of them
 * will stand on.
 */
async function boot(): Promise<void> {
  const view = await bootRenderer(requireMount('app'));

  publishHooks({ boot: { booted: true, render: view.probe }, view, atelier: null });
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
