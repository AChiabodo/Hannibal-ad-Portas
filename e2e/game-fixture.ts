/** The old army is a drawing/input fixture now, never the normal Match opening. */
import { bootRenderer } from '../src/render/boot.ts';
import { musterOpeningArmy } from '../src/render/opening.ts';
import { createSiegeWorld, type SiegeVisible } from '../src/sim/siege.ts';
import { economyMatchRules } from '../src/sim/economy-match.ts';
import { idleController } from '../src/sim/controller.ts';
import { failBoot, publishHooks, requireMount } from '../src/page.ts';
import { translate } from '../src/ui/strings.ts';

bootRenderer(requireMount('app'), {
  sessionControls: false,
  opponent: idleController<SiegeVisible>(),
  rules: { createWorld(seed) {
    const world = createSiegeWorld(seed);
    musterOpeningArmy(world, 'rome');
    return world;
  }, step: economyMatchRules.step },
}).then((view) => {
  document.title = translate('ui.title');
  publishHooks({ boot: { booted: true, render: view.probe }, game: view, view, atelier: null });
}).catch((error: unknown) => failBoot(error, 'app'));
