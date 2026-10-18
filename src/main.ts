import { failBoot, publishHooks, requireMount } from './page.ts';
import { bootRenderer } from './render/boot.ts';
import { translate } from './ui/strings.ts';

/**
 * Boots the game: the theatre B1 generated, on one texture under B2's camera,
 * the economy Match of B6 running behind B7's Italian interface, with the debug
 * hooks published.
 *
 * The war is not part of this page yet — B4 brings fog, C1 movement, C2 the
 * Squads a player commands — and what B7 puts here is the window a Player will
 * watch all of it through.
 */
async function boot(): Promise<void> {
  const view = await bootRenderer(requireMount('app'));

  // The table is the source of the page's title as well as of its canvas text,
  // so the markup's copy is a pre-script fallback rather than a second author.
  document.title = translate('ui.title');

  publishHooks({ boot: { booted: true, render: view.probe }, view, game: view, atelier: null });
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
