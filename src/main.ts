import { failBoot, publishHooks, requireMount } from './page.ts';
import { bootRenderer } from './render/boot.ts';
import { translate } from './ui/strings.ts';
import { readConfiguration } from './input/match-setup.ts';
import { showSetup } from './render/setup.ts';

/** Opens bitmap setup, or the complete Match described by a validated setup address. */
async function boot(): Promise<void> {
  document.title = translate('ui.title');
  const config = readConfiguration(new URLSearchParams(location.search));
  if (config === null) {
    await showSetup(requireMount('app'));
    return;
  }
  const view = await bootRenderer(requireMount('app'), { ...config, firstEntry: true });
  document.body.dataset.spqrScreen = 'match';

  publishHooks({ boot: { booted: true, render: view.probe }, view, game: view, atelier: null });
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
