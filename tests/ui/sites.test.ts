/**
 * What a Faction knows of the places on the map (ticket U6, ADR-0020).
 *
 * This is the module the map is drawn from and the panel opens from, so its two
 * claims are the ticket's rules rather than a drawing question:
 *
 * - **only allowed knowledge**: a place is in the list because the Faction holds it,
 *   remembers it, or has seen its tile — never because the theatre happens to carry
 *   it. A village nobody has looked at is absent.
 * - **memory is memory**: a remembered place has no front, and therefore no walls,
 *   no gate, no breach, no ram and no garrison. A place in view has the front the
 *   Observation carries for it, and that front is where every condition the map
 *   draws comes from.
 *
 * The fixtures are hand-built stages, so a reader can see what the Faction is
 * looking at: two Strongholds far apart, an army that walks up to one of them, a
 * village within Rome's own watch, and one nobody has ever looked at.
 */
import { describe, expect, it } from 'vitest';
import { createEconomy } from '../../src/sim/economy';
import { createFogs, eyeOf, refreshVision, SETTLEMENT_VISION, type FogView } from '../../src/sim/fog';
import { generateMap, type MapGrid, type Site } from '../../src/sim/map';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import {
  createSiege,
  createSiegeWorld,
  observeSiege,
  WALL_SECTIONS,
  type SiegeVisible,
  type SiegeWorld,
} from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { knownSites, siteIdentities, type KnownSite } from '../../src/ui/sites';
import { testMap } from '../sim/economy-fixtures';

/** The two Strongholds every stage stands on, far apart as a generated map's are. */
const ROME: Site = { x: 10, y: 10 };
const CARTHAGE: Site = { x: 85, y: 85 };

/** A village within Rome's own watch, and one far outside every eye. */
const NEAR_ROME: Site = { x: 16, y: 10 };
const IN_THE_FOG: Site = { x: 60, y: 40 };

/** A hand-built theatre: two Strongholds, two villages, and nothing else. */
function stage(): SiegeWorld {
  const map: MapGrid = testMap({ strongholds: [ROME, CARTHAGE], settlements: [NEAR_ROME, IN_THE_FOG] });
  const economy = createEconomy(map);

  return {
    map,
    calendar: startCalendar(),
    economy,
    autumns: 0,
    winters: 0,
    siege: createSiege(map, economy),
    fog: createFogs(),
  };
}

/** What one Faction sees, after a tick has written its vision and its contacts. */
function look(world: SiegeWorld, faction: 'rome' | 'carthage'): SiegeVisible {
  refreshSiegeFog(world, 0);

  return observeSiege(world, faction);
}

/**
 * What Rome may see, through the fog its own Observation carries — or through
 * another fog, which is how the page draws the debug watch (`render/game.ts`).
 */
function seenBy(world: SiegeWorld, fog?: FogView): readonly KnownSite[] {
  const seen = look(world, 'rome');

  return knownSites(siteIdentities(world.map), seen, fog ?? seen.fog, 'rome');
}

/** The place at a tile, as the Faction knows it, or `undefined`. */
function at(known: readonly KnownSite[], site: Site): KnownSite | undefined {
  return known.find((candidate) => candidate.x === site.x && candidate.y === site.y);
}

describe('the theatre’s own list of places', () => {
  it('numbers them the way the economy does: the Strongholds first, then the villages', () => {
    for (const seed of [1, 7, 42, 9001]) {
      const map = generateMap(seed);
      const economy = createEconomy(map);

      expect(siteIdentities(map).map(({ id, x, y }) => ({ id, x, y })))
        .toEqual(economy.settlements.map(({ id, x, y }) => ({ id, x, y })));
    }
  });

  it('says which places are Strongholds, which the Observation does not', () => {
    const identities = siteIdentities(stage().map);

    expect(identities.filter((site) => site.kind === 'stronghold')).toHaveLength(2);
    expect(identities.filter((site) => site.kind === 'settlement')).toHaveLength(2);
    expect(identities[0]).toMatchObject({ kind: 'stronghold', ...ROME });
  });
});

describe('what the Faction may see', () => {
  it('always has its own stronghold, with its walls and its gate', () => {
    const world = stage();
    const known = seenBy(world);
    const own = at(known, ROME);

    expect(own).toBeDefined();
    expect(own?.kind).toBe('stronghold');
    expect(own?.owner).toBe('rome');
    expect(own?.memory).toBe('seen');
    expect(own?.front?.structures).toHaveLength(WALL_SECTIONS + 1);
    expect(own?.front?.structures.some((structure) => structure.kind === 'gate')).toBe(true);
  });

  it('never shows a place it has not looked at', () => {
    const world = stage();
    const known = seenBy(world);

    // The enemy's Stronghold and the far village are both beyond every eye.
    expect(at(known, CARTHAGE)).toBeUndefined();
    expect(at(known, IN_THE_FOG)).toBeUndefined();
  });

  it('shows an enemy stronghold an army has marched up to, as the enemy’s, seen', () => {
    const world = stage();
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: CARTHAGE.x - 2, y: CARTHAGE.y });
    const known = seenBy(world);
    const enemy = at(known, CARTHAGE);

    expect(enemy).toBeDefined();
    expect(enemy?.kind).toBe('stronghold');
    expect(enemy?.owner).toBe('carthage');
    expect(enemy?.memory).toBe('seen');
    expect(enemy?.front?.structures).toHaveLength(WALL_SECTIONS + 1);
  });

  it('remembers it — a place, and no walls — when the army marches away', () => {
    const world = stage();
    const army = musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', x: CARTHAGE.x - 2, y: CARTHAGE.y,
    });
    look(world, 'rome');

    // Out of sight: the contact stays, and what the Faction can still say about the
    // walls is nothing (ADR-0020).
    army.x = ROME.x + 2;
    army.y = ROME.y + 2;
    const known = seenBy(world);
    const remembered = at(known, CARTHAGE);

    expect(remembered).toBeDefined();
    expect(remembered?.kind).toBe('stronghold');
    expect(remembered?.memory).toBe('remembered');
    expect(remembered?.front).toBeNull();
  });

  it('shows a village nobody holds, and says nobody holds it', () => {
    const world = stage();
    const known = seenBy(world);
    const village = at(known, NEAR_ROME);

    expect(village).toBeDefined();
    expect(village?.kind).toBe('settlement');
    expect(village?.owner).toBeNull();
    expect(village?.memory).toBe('seen');
    // A minor settlement has no fortification, which is a fact about what it is and
    // not an absence of knowledge: the front is there, with nothing in it.
    expect(village?.front?.structures).toHaveLength(0);
  });

  it('remembers a village as a place, with no front to read', () => {
    const world = stage();
    // A watch that has been out to the far village and come back: the ground it saw
    // is remembered, and the place with it — with no front, because no eye covers it
    // now and a front is only what an eye reports.
    refreshVision(world.fog.rome, world.map, [eyeOf(IN_THE_FOG, SETTLEMENT_VISION)]);
    const known = seenBy(world);
    const village = at(known, IN_THE_FOG);

    expect(village).toBeDefined();
    expect(village?.memory).toBe('remembered');
    expect(village?.owner).toBeNull();
    expect(village?.front).toBeNull();
  });

  it('refuses a fog that is not over this theatre', () => {
    const world = stage();
    const seen = look(world, 'rome');
    const wrong = { ...seen.fog, terrain: new Uint8Array(4) };

    expect(() => knownSites(siteIdentities(world.map), seen, wrong, 'rome')).toThrow(RangeError);
  });
});

describe('the world a Match opens', () => {
  it('opens with its own Stronghold on the map, and no enemy stronghold seen', () => {
    const world = createSiegeWorld(11);
    const known = seenBy(world);

    expect(known.filter((site) => site.kind === 'stronghold')).toHaveLength(1);
    expect(known.every((site) => site.owner === 'rome' || site.owner === null)).toBe(true);
  });
});
