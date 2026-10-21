import { describe, expect, it } from 'vitest';
import { hudLayout, hudModel } from '../../src/ui/hud';
import { TILE_COUNT } from '../../src/sim/map';
import type { EconomyVisible } from '../../src/sim/economy-match';
import { economyMatchRules, observeEconomy } from '../../src/sim/economy-match';
import { createMatch } from '../../src/sim/match';
import { SEASON_TICKS } from '../../src/sim/season';
import { projectSettlement, forecastTreasury } from '../../src/ui/forecast';
import { BUILDINGS } from '../../src/content/buildings';
import { CONSTRUCTION_CATEGORIES } from '../../src/ui/construction';
import { settlementOrders } from '../../src/ui/orders';
import { measureText } from '../../src/art/font';

const visible: EconomyVisible = {
  season: 'spring', year: 1, treasury: 20, territory: new Uint8Array(TILE_COUNT), squads: [],
  settlements: [{ id: 0, x: 10, y: 10, tier: 1, population: 10,
    stocks: { grain: 20, timber: 20, stone: 10, iron: 10 },
    land: { grain: 3, timber: 3, stone: 2, iron: 2 }, works: [] }],
};

describe('the economic decision panel', () => {
  it('covers every applicable offer once, quotes seconds and explains blocked purchases for both Factions', () => {
    for (const faction of ['rome', 'carthage'] as const) {
      const seen: string[] = [];
      for (const category of CONSTRUCTION_CATEGORIES) {
        const offers = settlementOrders(visible, faction, visible.settlements[0]!, 'construction', false, 1, category.id);
        seen.push(...offers.map((offer) => offer.subject!));
        for (const offer of offers) {
          expect(offer.note).toContain('Lavoratori:');
          expect(offer.note).toContain('limite');
          expect(offer.note).toContain(' s.');
          if (!offer.enabled) expect(offer.reason).toBeTruthy();
        }
      }
      expect(seen.sort()).toEqual(BUILDINGS.filter((building) => !building.faction || building.faction === faction)
        .map((building) => building.id).sort());
      const empty = { ...visible.settlements[0]!, stocks: { grain: 0, timber: 0, stone: 0, iron: 0 } };
      expect(settlementOrders(visible, faction, empty, 'construction').every((offer) => !offer.enabled && offer.reason)).toBe(true);
    }
  });
  it('quotes the same local stocks, population and Treasury that real Season boundaries leave', () => {
    const match = createMatch({ seed: 7, rules: economyMatchRules });
    // Four boundaries cover growth, autumn Harvest and winter land output.
    for (let boundary = 1; boundary <= 4; boundary += 1) {
      while (match.state.tick < boundary * SEASON_TICKS - 1) match.step();
      const before = observeEconomy(match.state.world, 'rome');
      const forecast = forecastTreasury(before, match.state.tick);
      expect(forecast.available).toBe(true);
      if (!forecast.available) throw new Error('the unopposed settlement must be derivable');
      const projected = projectSettlement(before.settlements[0]!, forecast.value.season);
      match.step();
      const after = observeEconomy(match.state.world, 'rome');
      expect(after.treasury).toBe(forecast.value.resulting);
      expect(after.settlements[0]!.population).toBe(projected.population);
      if (!projected.harvestUncertain) expect(after.settlements[0]!.stocks).toEqual(projected.stocks);
    }
  });
  it('shows only the selected construction category and keeps locked progression visible', () => {
    const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [], { desktop: true, uiScale: 2 },
      { faction: 'rome', tab: 'construction', category: 'development' });
    expect(model.commands.map((offer) => offer.subject)).toEqual(['house', 'villa', 'forum']);
    expect(model.commands.find((offer) => offer.subject === 'forum')).toMatchObject({ enabled: false });
    for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const layout = hudLayout(model, size);
      expect(layout.buttons.filter((button) => button.action.startsWith('category:'))).toHaveLength(4);
      for (const button of layout.buttons.filter((item) => item.action.startsWith('category:'))) {
        expect(measureText(button.text, 2), button.text).toBeLessThanOrEqual(button.rect.width - 16);
      }
      for (const { rect } of layout.commands) {
        expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
      }
    }
  });
});
