import { describe, expect, it } from 'vitest';
import { build, type Command } from '../../src/sim/command';
import {
  applyEconomyCommand,
  createEconomy,
  UNOWNED,
  type Economy,
  type Squad,
} from '../../src/sim/economy';
import type { MapGrid, Site } from '../../src/sim/map';
import { createMatch, type Match } from '../../src/sim/match';
import { economyMatchRules, type EconomyWorld } from '../../src/sim/economy-match';
import { musterSquad } from '../../src/sim/movement';
import { SEASON_TICKS, startCalendar, type Season } from '../../src/sim/season';
import {
  applyAttrition,
  ATTRITION_FIELD_WINTER_PERCENT,
  ATTRITION_PERCENT,
  ATTRITION_WINTER_PERCENT,
  attritionPercent,
  CAMP_RADIUS,
  canCamp,
  holdsTerritory,
  inCamp,
  inQuarters,
  territoryAt,
  territoryOf,
  TERRITORY_RADIUS,
} from '../../src/sim/territory';
import { CARTHAGE, ROME, strongholdStage, testMap, work } from './economy-fixtures';

/** A tile far enough from both Strongholds that nobody's writ reaches it. */
const OPEN_FIELD: Site = { x: 40, y: 10 };

/**
 * A tile in Rome's own country, in the open rather than in the town: inside the
 * Territory, outside the camp a Castrum would make of the ground round a
 * settlement.
 */
const ROME_IN_THE_OPEN: Site = { x: ROME.x + CAMP_RADIUS + 1, y: ROME.y };

/** The world the economy's Match plays on a stage a test has painted. */
function worldOf(map: MapGrid = strongholdStage()): EconomyWorld {
  return { map, calendar: startCalendar(), economy: createEconomy(map), autumns: 0, winters: 0 };
}

/** A Match on a stage a test has shaped, so `step` advances the tick the rules see. */
function matchOn(world: EconomyWorld): Match<EconomyWorld, Command> {
  return createMatch({ seed: 1, rules: { createWorld: () => world, step: economyMatchRules.step } });
}

/** Advances a Match a whole number of ticks with no Commands. */
function run(match: Match<EconomyWorld, Command>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) match.step();
}

/** A Squad stood on a tile, at the full strength of its type: a hundred and twenty men. */
function muster(economy: Economy, map: MapGrid, site: Site, faction: 'rome' | 'carthage' = 'rome'): Squad {
  return musterSquad(economy, map, {
    faction,
    squadType: faction === 'rome' ? 'hastati' : 'libyan-spear',
    x: site.x,
    y: site.y,
  });
}

/**
 * A Squad charged exactly one Season of Attrition where it stands: one stage, one
 * Season, so what it lost is that Season's price and nothing else.
 */
function chargedOneSeason(season: Season, site: Site, faction: 'rome' | 'carthage' = 'rome'): Squad {
  const map = strongholdStage();
  const economy = createEconomy(map);
  const squad = muster(economy, map, site, faction);

  applyAttrition(economy, season);

  return squad;
}

/** The ground a tile of the stage is, read the way a rule reads it. */
function ownerOfTile(economy: Economy, site: Site): number {
  return territoryAt(territoryOf(economy), site.x, site.y);
}

describe('the Territory a Faction is inferred to hold', () => {
  it('is the ground within reach of its settlements, and nobody’s beyond it', () => {
    const territory = territoryOf(createEconomy(strongholdStage()));

    expect(territoryAt(territory, ROME.x, ROME.y)).toBe(0);
    expect(territoryAt(territory, ROME.x, ROME.y + TERRITORY_RADIUS)).toBe(0);
    expect(territoryAt(territory, ROME.x, ROME.y + TERRITORY_RADIUS + 1)).toBe(UNOWNED);
    expect(territoryAt(territory, CARTHAGE.x, CARTHAGE.y)).toBe(1);
  });

  it('is nobody’s around a minor settlement until a Faction takes it', () => {
    const economy = createEconomy(strongholdStage([OPEN_FIELD]));

    expect(ownerOfTile(economy, OPEN_FIELD)).toBe(UNOWNED);
    expect(holdsTerritory(territoryOf(economy), 0, OPEN_FIELD)).toBe(false);
    expect(holdsTerritory(territoryOf(economy), 1, OPEN_FIELD)).toBe(false);
  });

  it('is redrawn when a settlement changes hands, cache and all', () => {
    // Ten tiles from Carthage's Stronghold, so Carthage's writ covers the
    // village ground while nobody has taken the village itself.
    const minor: Site = { x: CARTHAGE.x - 10, y: CARTHAGE.y };
    const economy = createEconomy(strongholdStage([minor]));

    expect(ownerOfTile(economy, minor)).toBe(1);

    const village = economy.settlements[2];
    if (village === undefined) throw new Error('the stage has no minor settlement');
    village.owner = 0;

    // Rome took it, and the ground nearer the village than Carthage's Stronghold
    // changed hands with it: both Factions' Territory moved, not one.
    expect(ownerOfTile(economy, minor)).toBe(0);
    expect(ownerOfTile(economy, CARTHAGE)).toBe(1);
    expect(territoryAt(territoryOf(economy), CARTHAGE.x - 1, CARTHAGE.y)).toBe(1);
  });

  it('gives contested ground to the settlement standing nearer it, and a tie to the first', () => {
    const territory = territoryOf(createEconomy(strongholdStage()));

    expect(territoryAt(territory, 22, 10)).toBe(0);
    expect(territoryAt(territory, CARTHAGE.x - TERRITORY_RADIUS, 10)).toBe(1);

    // A tile exactly between two settlements: the economy's own order decides,
    // which is Rome's Stronghold by its id.
    const tied = territoryOf(createEconomy(testMap({
      strongholds: [{ x: 20, y: 20 }, { x: 24, y: 20 }],
    })));

    expect(territoryAt(tied, 22, 20)).toBe(0);
  });
});

describe('the Attrition a Season outside the Territory costs', () => {
  it('costs men away from home, and none in your own country in campaign season', () => {
    // A hundred and twenty men, two percent of them: two men.
    expect(chargedOneSeason('autumn', OPEN_FIELD).strength).toBe(118);
    expect(chargedOneSeason('autumn', ROME_IN_THE_OPEN).strength).toBe(120);
  });

  it('charges both Factions the same for the same ground: the asymmetry is the camp, not the price', () => {
    // Carthage's army in nobody's country pays what Rome's does — the rule is
    // the map's and not a Faction's, and it is the quarters Rome can make of a
    // field that are Rome's alone.
    expect(chargedOneSeason('winter', OPEN_FIELD, 'carthage').strength).toBe(46);
    expect(chargedOneSeason('summer', OPEN_FIELD, 'carthage').strength).toBe(47);
  });

  it('is visibly worse in winter than in autumn, and worst of all in the open away', () => {
    // Six percent of a hundred and twenty men is seven where two percent is two,
    // and wintering in the open at home is the price of a Season out of supply.
    expect(chargedOneSeason('winter', OPEN_FIELD).strength).toBe(113);
    expect(chargedOneSeason('winter', ROME_IN_THE_OPEN).strength).toBe(118);
    expect(chargedOneSeason('winter', ROME).strength).toBe(120);
  });

  it('prices each Season by where the Squad is, one price and not a sum', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    const inTheField = muster(economy, map, ROME_IN_THE_OPEN);
    const away = muster(economy, map, OPEN_FIELD);

    expect(attritionPercent(economy, inTheField, 'summer')).toBe(0);
    expect(attritionPercent(economy, inTheField, 'winter')).toBe(ATTRITION_FIELD_WINTER_PERCENT);
    expect(attritionPercent(economy, away, 'summer')).toBe(ATTRITION_PERCENT);
    expect(attritionPercent(economy, away, 'winter')).toBe(ATTRITION_WINTER_PERCENT);
  });

  it('winters in quarters: inside a settlement, or in the camp in its ground', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    const inTheTown = muster(economy, map, ROME);
    const inTheCampGround = muster(economy, map, { x: ROME.x + CAMP_RADIUS, y: ROME.y });

    // Rome may raise the Castrum the camp is.
    expect(applyEconomyCommand(economy, build('rome', 0, 'castrum'))).toBe(true);
    economy.settlements[0]?.works.push(work('castrum'));

    expect(inQuarters(economy, inTheTown)).toBe(true);
    expect(inCamp(economy, inTheCampGround)).toBe(true);
    expect(attritionPercent(economy, inTheCampGround, 'winter')).toBe(0);
  });

  it('is Rome’s camp alone: Carthage cannot raise the building that makes one', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    const carthaginian = muster(economy, map, { x: CARTHAGE.x + CAMP_RADIUS, y: CARTHAGE.y }, 'carthage');

    expect(applyEconomyCommand(economy, build('carthage', 1, 'castrum'))).toBe(false);
    expect(inCamp(economy, carthaginian)).toBe(false);
    expect(inQuarters(economy, carthaginian)).toBe(false);
    expect(attritionPercent(economy, carthaginian, 'winter')).toBe(
      ATTRITION_FIELD_WINTER_PERCENT,
    );
  });

  it('is not Carthage’s either when the village and its camp are taken', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    const village = economy.settlements[0];
    if (village === undefined) throw new Error('the stage has no Roman Stronghold');

    village.works.push(work('castrum'));

    const roman = muster(economy, map, { x: ROME.x + CAMP_RADIUS, y: ROME.y });
    expect(inCamp(economy, roman)).toBe(true);

    // Carthage holds the ground now, works and all — nothing is razed when a
    // settlement is taken (C5) — and the camp standing in it is still a Roman
    // camp: a Carthaginian army winters in the open beside it.
    village.owner = 1;
    const carthaginian = muster(economy, map, { x: ROME.x + CAMP_RADIUS, y: ROME.y }, 'carthage');

    expect(canCamp('carthage')).toBe(false);
    expect(inCamp(economy, carthaginian)).toBe(false);
    expect(attritionPercent(economy, carthaginian, 'winter')).toBe(
      ATTRITION_FIELD_WINTER_PERCENT,
    );

    // And Rome's own army still winters in it, because the camp is Rome's: a
    // Faction that retakes the village finds its camp where it left it.
    expect(inCamp(economy, roman)).toBe(false);
    village.owner = 0;
    expect(inCamp(economy, roman)).toBe(true);
  });

  it('takes a marching army for none of it: a camp is where a Squad holds position', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    economy.settlements[0]?.works.push(work('castrum'));

    const marching = muster(economy, map, { x: ROME.x + CAMP_RADIUS, y: ROME.y });
    marching.steps = [0];

    expect(inCamp(economy, marching)).toBe(false);
  });

  it('leaves a garrison and a Squad on its own settlement’s centre alone', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    const inTheTown = muster(economy, map, ROME);
    const inTheWalls = muster(economy, map, { x: ROME.x, y: ROME.y + 1 });
    inTheWalls.garrison = 0;

    applyAttrition(economy, 'winter');

    expect(inTheTown.strength).toBe(120);
    expect(inTheWalls.strength).toBe(120);
  });

  it('wears away the force that overextended without supply until there is none of it', () => {
    const map = strongholdStage();
    const economy = createEconomy(map);
    muster(economy, map, OPEN_FIELD);

    let seasons = 0;
    while (economy.squads.length > 0 && seasons < 200) {
      applyAttrition(economy, 'summer');
      seasons += 1;
    }

    // A campaign's cost and not an execution: the force lasts many Seasons and
    // is then gone, rather than left standing at one man for ever.
    expect(economy.squads).toHaveLength(0);
    expect(seasons).toBeGreaterThan(10);
    expect(seasons).toBeLessThan(200);
  });
});

describe('Attrition in a Match that runs', () => {
  it('charges at the Season boundary and not before it', () => {
    const world = worldOf();
    const away = muster(world.economy, world.map, OPEN_FIELD);
    const match = matchOn(world);

    run(match, SEASON_TICKS - 1);
    expect(away.strength).toBe(120);

    // The boundary was crossed on the last of those ticks: the Season's work
    // lands then, and the army is charged for the Season it has just spent.
    match.step();
    expect(away.strength).toBe(118);
  });

  it('winters an army in the field for more than autumn costs it, and a camped one for nothing', () => {
    const world = worldOf();
    const away = muster(world.economy, world.map, OPEN_FIELD);
    const inTheOpenAtHome = muster(world.economy, world.map, ROME_IN_THE_OPEN);

    // Rome winters an army in the open ground of a camp, and Carthage has none:
    // the same ground, without the Castrum, is what the Squad above is standing in.
    world.economy.settlements[0]?.works.push(work('castrum'));
    const camped = muster(world.economy, world.map, { x: ROME.x + CAMP_RADIUS, y: ROME.y });

    // Spring to winter: summer, autumn and the winter they were charged for.
    run(matchOn(world), SEASON_TICKS * 3);

    // Away: two men in summer, two in autumn, and six for the winter — while the
    // army in its own country pays nothing in the two campaign Seasons and two
    // for the winter in the open, and nothing at all with a camp over it.
    expect(away.strength).toBe(110);
    expect(inTheOpenAtHome.strength).toBe(118);
    expect(camped.strength).toBe(120);
  });
});
