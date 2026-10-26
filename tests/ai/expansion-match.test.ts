import { describe, expect, it } from 'vitest';
import { createArmyController } from '../../src/cli/ai-match.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { createEconomy } from '../../src/sim/economy.ts';
import { createFogs } from '../../src/sim/fog.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { createSiege, observeSiege, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { plainMap } from '../sim/test-map.ts';

function theatre() {
  const map = { ...plainMap(), strongholds: [{ x: 20, y: 20 }, { x: 120, y: 120 }] as const,
    settlements: [{ x: 50, y: 26 }, { x: 90, y: 90 }] };
  const economy = createEconomy(map);
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 111, y: 120 });
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 46, y: 26 });
  const garrison = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 120, y: 120 });
  garrison.garrison = 1;
  return { map, economy, calendar: startCalendar(), siege: createSiege(map, economy),
    fog: createFogs(), autumns: 0, winters: 0 };
}

describe('economic expansion through permitted Match observations', () => {
  it('does not report a neutral village ownership change after the observer has left', () => {
    function play(capture: boolean) {
      let remembered: SiegeVisible['contacts'][number] | undefined;
      let seenUnowned = false;
      let captured = false;
      const march = scriptedController<SiegeVisible>([
        { tick: 1, command: { kind: 'move', faction: 'rome', squads: [1], x: 20, y: 20 } },
      ]);
      const opponent = scriptedController<SiegeVisible>(capture ? [
        { tick: 200, command: { kind: 'move', faction: 'carthage', squads: [4], x: 90, y: 90 } },
      ] : []);
      runMatch({ seed: 7, ticks: 1001, rules: { ...siegeMatchRules, createWorld() {
        const world = theatre();
        world.economy.squads[0]!.x = 90;
        world.economy.squads[0]!.y = 86;
        musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 94, y: 90 });
        return world;
      } }, observe: observeSiege, outcome: () => null, players: [
        { faction: 'rome', controller: { decide(observation) {
          remembered = observation.visible.contacts.find((contact) => contact.kind === 'settlement' && contact.id === 3);
          seenUnowned ||= remembered?.unowned === true;
          return march.decide(observation);
        } } }, { faction: 'carthage', controller: { decide(observation) {
          captured ||= observation.visible.settlements.some((settlement) => settlement.id === 3);
          return opponent.decide(observation);
        } } },
      ] });
      expect(seenUnowned).toBe(true);
      expect(remembered).toMatchObject({ kind: 'settlement', id: 3, x: 90, y: 90 });
      expect(remembered?.unowned).toBeUndefined();
      return { remembered, captured };
    }
    const stillNeutral = play(false);
    const secretlyTaken = play(true);
    expect(stillNeutral.captured).toBe(false);
    expect(secretlyTaken.captured).toBe(true);
    expect(secretlyTaken.remembered).toEqual(stillNeutral.remembered);
  }, 15000);

  it('remembers a discovered neutral village and takes it when the known Stronghold is too strong', () => {
    const setup = { seed: 7, ticks: 2601, rules: { ...siegeMatchRules, createWorld: theatre },
      observe: observeSiege, outcome: () => null };
    let discovered = false;
    let captured = false;
    const ai = createArmyController('centurio');
    const run = runMatch({ ...setup, players: [
      { faction: 'rome', controller: { decide(observation) {
        discovered ||= observation.visible.contacts.some((contact) => contact.kind === 'settlement' && contact.id === 2);
        if (observation.tick <= 201) expect(observation.visible.contacts.some((contact) =>
          contact.kind === 'settlement' && contact.id === 3)).toBe(false);
        captured ||= observation.visible.settlements.some((settlement) => settlement.id === 2);
        return ai.decide(observation);
      } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) },
    ] });
    expect(discovered).toBe(true);
    expect(captured).toBe(true);
    expect(run.log.some(({ command }) => command.kind === 'move' && command.x === 50 && command.y === 26)).toBe(true);
    expect(run.log.find(({ command }) => command.kind === 'move' && command.x === 50 && command.y === 26)!.tick)
      .toBeGreaterThanOrEqual(2100);
    const replayed = runMatch({ ...setup, players: [
      { faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) },
    ] });
    expect(replayed.hash).toBe(run.hash);
  }, 15000);
});
