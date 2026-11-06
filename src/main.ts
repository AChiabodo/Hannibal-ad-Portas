import { failBoot, requireMount } from './page.ts';
import { showJourney } from './render/journey.ts';
import { translate } from './ui/strings.ts';
import { readConfiguration } from './input/match-setup.ts';

/** Opens bitmap setup, or the complete Match described by a validated setup address. */
async function boot(): Promise<void> {
  document.title = translate('ui.title');
  const config = readConfiguration(new URLSearchParams(location.search));
  await showJourney(requireMount('app'), config);
}

boot().catch((error: unknown) => {
  failBoot(error, 'app');
});
