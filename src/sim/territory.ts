/**
 * Territory and Attrition: supply as a place on the map (PLAN §4, ADR-0005,
 * ticket C6).
 *
 * ADR-0005 settled that supply is **Territory** and nothing else — no convoys,
 * no depots and no supply-line units — so "is this army fed?" has to be a
 * question the map can answer. This module answers it, and then charges for the
 * answer.
 *
 * ## Territory is inferred, and never drawn
 *
 * A Faction's Territory is the ground within `TERRITORY_RADIUS` of the
 * settlements it holds (GLOSSARY: Territory). Nothing stores it: it is derived
 * from the settlements' owners every time it is asked for, so a campaign that
 * takes a settlement redraws the Territory on the tick it falls, and there is no
 * second place for a boundary to be written down and drift away from the
 * settlements it is supposed to follow.
 *
 * The squares of the two Factions can overlap, because settlements stand within
 * reach of one another. A contested tile goes to the settlement standing nearer
 * it — the metaphor is the nearer market town, not a surveyor — and a tile
 * exactly halfway between two settlements goes to the one the economy holds
 * first, which is Rome's Stronghold by its id. Chebyshev distances only, in
 * whole tiles: no square root, no float, no transcendental (ADR-0006).
 *
 * The result is a grid of owners in the shape of the theatre, which is what an
 * Observation is handed a Faction's own half of (`territoryView`).
 *
 * ## Attrition is what standing outside it costs
 *
 * A Squad outside its own Territory is far from the fields that feed it, and
 * pays for it in **men** every Season (GLOSSARY: Attrition). Winter is worse
 * than autumn — the Season the plan makes the campaign season's end — and
 * wintering in the open *inside* one's own country costs a little too, which is
 * the plan's "the AI keeps winter quarters" made mechanical rather than
 * asserted.
 *
 * The cost is a **percentage of the men a Squad is counted as**, and not a fixed
 * number of them. A flat tax of one man a Season would be invisible in a line of
 * a hundred and twenty and ruinous to an elephant of twenty-four, and it would
 * never wear a force out: attrition is meant to make a long campaign
 * unsustainable (the ticket's words), and a proportional loss is what compounds
 * into that. A percentage of a small enough Squad rounds to nobody, so every
 * charged Season takes at least one man — which is also what lets attrition
 * alone end a force that overextended without supply.
 *
 * ## Quarters, and Rome's Castrum
 *
 * A Squad winters under cover when it is in **quarters**:
 *
 * - inside one of its Faction's settlements — garrisoned in it, or standing on
 *   within its inhabited core; or
 * - holding position within `CAMP_RADIUS` of a settlement its Faction holds that
 *   has a standing **Castrum** (`content/buildings.ts`).
 *
 * The Castrum is the plan's Roman field camp and Rome's alone — `canCamp` is the
 * whole of that, on the same terms as `siege.ts`'s `canAssault` — and this is
 * where it stops being a building that forages a little: a camp makes the open
 * ground round a settlement a place to winter, so a Roman army can hold a
 * captured minor settlement through the winter without paying for the field, and
 * a Carthaginian one — which can neither raise a Castrum nor garrison open
 * ground — cannot. Rome has interior lines; Carthage has to come home.
 *
 * Rome's alone even when the ground changes hands, which is the sharp edge of the
 * same rule: nothing is razed when a settlement is taken (`siege.ts`), so a
 * Carthaginian army that storms a Roman village finds a Roman camp standing in
 * it, and a Roman camp is not Carthage's to winter in.
 *
 * Everything here reads the economy and nothing else, because a Territory is
 * inferred from settlements and a camp stands in one. That is also what keeps
 * the module importable from `combat.ts`: `inSupply` is this module's question,
 * asked there (see `combat.ts`'s note that C6 owns the real Territory).
 */
import { buildingCode } from '../content/index.ts';
import { isHeld, UNOWNED, type Economy, type Settlement, type Squad } from './economy.ts';
import { factionOf, type Faction, type FactionCode } from './faction.ts';
import { MAP_HEIGHT, MAP_WIDTH, TILE_COUNT, tileIndex, type Site } from './map.ts';
import type { Season, SeasonHooks } from './season.ts';
import { FIELD } from './squad.ts';
import { coreOf, squadGround } from './settlement-space.ts';
import { containsTile } from '../content/settlement-layout.ts';

/**
 * How far from a settlement its Faction's writ reaches, in tiles, Chebyshev.
 *
 * Twelve tiles each way is a 25×25 square — 625 tiles, about a fifteenth of the
 * theatre — so the two Factions' squares cover a little of the map at the
 * opening and much of it once each has taken its share of the minor settlements,
 * and there is always wilderness between them for an army to be cut off in. The
 * number is deliberately close to a settlement's `LAND_RADIUS`: the country an
 * army can draw on is the country its settlements farm.
 *
 * F1 is where this number is measured rather than argued about, with the rest of
 * the balance.
 */
export const TERRITORY_RADIUS = 12;

/**
 * How far from a settlement its Castrum makes the open ground count as quarters.
 *
 * Smaller than the Territory, because it is a camp and not a province: what it
 * buys is the field round one settlement, for the army wintering with it.
 */
export const CAMP_RADIUS = 6;

/**
 * What a Season outside the Faction's own Territory costs a Squad: two men in a
 * hundred.
 *
 * A hundred and twenty men lose two or three; an elephant of twenty-four loses
 * one. Small, because the Season already costs Payroll and the road costs the
 * march — this is what a campaign costs *besides* those.
 */
export const ATTRITION_PERCENT = 2;

/**
 * What a winter outside the Territory costs: three times as much, which is what
 * makes winter the Season a campaign ends in (PLAN §4).
 */
export const ATTRITION_WINTER_PERCENT = 6;

/**
 * What wintering in the open *inside* the Territory costs, with no camp: the
 * cold, the wet and the sickness of an army with no roof over it.
 *
 * It is the penalty a camp cancels — for Rome, in the field; for Carthage,
 * nowhere but a town — and it is the same weight as a Season out of supply, so
 * an army at home but unsheltered is not a harsher thing than one far from home
 * in autumn.
 */
export const ATTRITION_FIELD_WINTER_PERCENT = 2;

/**
 * The one building that makes the field a place to winter: Rome's Castrum.
 *
 * Held as the building's content code — the number a work in state carries —
 * looked up from its id once, so a camp is found by comparing two integers
 * rather than by walking the building table. Whether the Faction standing in it
 * may *use* it is `canCamp`'s question and not this one's.
 */
const CAMP = buildingCode('castrum');

/**
 * The boundary an Observation is read with: one owner per tile of the theatre.
 *
 * A derived value and not state (ADR-0006): nothing hashes it, a replay that
 * computed it a different number of times computes the same grid, and it is
 * rebuilt from the settlements' owners the moment one of them changes hands. The
 * array is shared by everything `territoryOf` hands it to, so a caller reads it
 * and does not write it.
 */
export interface Territory {
  /** Per tile, the Faction that draws supply from it, or `UNOWNED` for nobody's. */
  readonly owners: Int8Array;
}

/** What the cache remembers of one economy: the owners it was inferred from, and the grid. */
interface Remembered {
  /** The settlements' owners, in id order: the whole of what the grid depends on. */
  readonly key: string;

  /** The grid those owners produce. */
  readonly territory: Territory;
}

/**
 * The grids already inferred, one economy each.
 *
 * Not state, for the ordinary reason (ADR-0006): the answer is a pure function
 * of the settlements the economy holds and who owns them, so remembering it
 * cannot change what a Match does — and the driver asks for an Observation on
 * every tick, which is far too often to walk eight squares of six hundred tiles.
 *
 * The key is the owners rather than the economy's identity, because an economy is
 * mutated in place: a settlement changing hands changes the key, and the grid is
 * then inferred again rather than handed out stale.
 */
const CACHE = new WeakMap<Economy, Remembered>();

/**
 * The per-Faction views already built, keyed by the grid they were built from.
 *
 * Keying them by the grid rather than by the economy is the whole of the
 * invalidation: a settlement changing hands produces a new grid, and the new
 * grid has no views remembered against it yet, so a stale boundary cannot be
 * handed out (see `territoryView`).
 */
const VIEWS = new WeakMap<Int8Array, Map<number, Uint8Array>>();

/**
 * The Territory two Factions hold, inferred from the settlements they hold.
 *
 * Pure in the economy's ownership, so two Matches in the same position draw the
 * same boundaries, and cheap after the first call in a position (see `CACHE`). A
 * settlement nobody holds — a minor settlement waiting to be taken — projects
 * nothing: its ground stays `UNOWNED` until a Faction takes it, which is what
 * makes taking one worth doing.
 */
export function territoryOf(economy: Economy): Territory {
  const key = ownershipKey(economy);
  const remembered = CACHE.get(economy);
  if (remembered !== undefined && remembered.key === key) return remembered.territory;

  const territory: Territory = { owners: inferOwners(economy) };
  CACHE.set(economy, { key, territory });

  return territory;
}

/** The Faction that draws supply from a tile, or `UNOWNED` when nobody does. */
export function territoryAt(territory: Territory, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return UNOWNED;

  return territory.owners[tileIndex(x, y)] ?? UNOWNED;
}

/** Whether a Faction's Territory covers a tile: the whole of what "in supply" means. */
export function holdsTerritory(territory: Territory, owner: number, site: Site): boolean {
  return territoryAt(territory, site.x, site.y) === owner;
}

/**
 * One Faction's own Territory, as an Observation carries it: `1` where it draws
 * supply, `0` everywhere else.
 *
 * A grid of its own rather than the whole boundary, because whose Territory a
 * distant tile belongs to is another Faction's business: a Faction knows the
 * country its own settlements give it, and learns the rest by marching on it
 * (B4's fog is where *that* half of knowing belongs).
 *
 * The grid is remembered with the Territory it was made from and shared, the way
 * `fog.ts`'s `viewOf` shares a Faction's own memory: what keeps a Controller
 * from writing through it is the driver's copy of the projection, not a fresh
 * array per tick — and a walk of the whole theatre on every tick is a price an
 * Observation may not charge.
 */
export function territoryView(territory: Territory, owner: FactionCode): Uint8Array {
  let built = VIEWS.get(territory.owners);
  if (built === undefined) {
    built = new Map();
    VIEWS.set(territory.owners, built);
  }

  const known = built.get(owner);
  if (known !== undefined) return known;

  const tiles = new Uint8Array(TILE_COUNT);

  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (territory.owners[tile] === owner) tiles[tile] = 1;
  }

  built.set(owner, tiles);

  return tiles;
}

/**
 * Whether a Faction makes camps at all.
 *
 * Rome's alone, because the Castrum is (`content/buildings.ts`), and this is the
 * one place that would move to give Carthage a camp — exactly as `siege.ts`'s
 * `canAssault` is the whole of "the ram is Rome's alone", and for the same
 * reason (ADR-0008's escape hatch). Reading it here rather than inferring it from
 * who owns the ground is what makes a captured camp a Roman camp standing in
 * someone else's village: nothing is razed when a settlement is taken, and a
 * Carthaginian army cannot winter in another Faction's camp.
 */
export function canCamp(faction: Faction): boolean {
  return faction === 'rome';
}

/**
 * Whether a Squad is in a camp: holding position in the open ground a Castrum
 * makes into winter quarters (GLOSSARY: Attrition, Camp; PLAN §1).
 *
 * "Holding position" is the ticket's own phrase and it is read literally: a
 * Squad with somewhere left to walk is on the road and not in camp. A garrisoned
 * Squad is inside a settlement's walls rather than in its ground, and a Squad on
 * the settlement's own centre is in the town, so neither is in the *camp* — they
 * are in quarters already, and `inQuarters` is where the two are one answer.
 *
 * The camp has to be the Squad's own Faction's camp (`canCamp`), and it has to be
 * standing: a settlement whose Castrum is still going up shelters nobody.
 */
export function inCamp(economy: Economy, squad: Squad): boolean {
  if (squad.steps.length > 0) return false;
  if (insideSettlement(economy, squad)) return false;
  if (!canCamp(factionOf(squad.owner))) return false;

  return economy.settlements.some(
    (settlement) =>
      settlement.owner === squad.owner &&
      hasCamp(settlement) &&
      within(squad, settlement, CAMP_RADIUS),
  );
}

/**
 * Whether a Squad winters under cover: inside one of its Faction's settlements,
 * or in a camp in the field.
 *
 * The two answer one question between them — is there a roof over this army —
 * and each is a different kind of roof: the walls or the centre of a town, which
 * either Faction can give its men, and a camp, which only Rome can.
 */
export function inQuarters(economy: Economy, squad: Squad): boolean {
  return insideSettlement(economy, squad) || inCamp(economy, squad);
}

/**
 * What one Season outside its country costs one Squad, in percent of its men.
 *
 * Zero when there is nothing to pay: a Squad in its own Territory in any Season
 * but winter, and one under cover in winter. Otherwise the year's three prices
 * above, one of them, and never a sum — an army far from home in winter pays the
 * winter price whole, which is what makes it the worst place to be.
 *
 * The Territory is asked of the economy rather than handed in, so the boundary a
 * Squad is judged against cannot be some other position's: the grid is
 * remembered until an ownership changes (`territoryOf`), so asking again costs a
 * lookup rather than a walk of the theatre.
 */
export function attritionPercent(economy: Economy, squad: Squad, season: Season): number {
  if (!holdsTerritory(territoryOf(economy), squad.owner, squad)) {
    return season === 'winter' ? ATTRITION_WINTER_PERCENT : ATTRITION_PERCENT;
  }

  if (season !== 'winter') return 0;

  return inQuarters(economy, squad) ? 0 : ATTRITION_FIELD_WINTER_PERCENT;
}

/**
 * The Season hooks Attrition subscribes to: every boundary, because every Season
 * is one a Squad spends where it stands.
 *
 * A hook object of its own rather than a call from inside the economy's, which is
 * the shape the clock was built for (`season.ts`: one subscriber object per
 * system, and the same report handed to each) and the one the README draws. The
 * economy's own Season work lands first, so Attrition charges what is left of the
 * army for the Season it has just spent.
 */
export function attritionSeasons(economy: Economy): SeasonHooks {
  return {
    onSeason: (change) => {
      applyAttrition(economy, change.season);
    },
  };
}

/**
 * Charges every Squad for the Season it has just spent, and takes the men
 * Attrition costs it: what `attritionSeasons` subscribes to.
 *
 * Called at a Season boundary, after the economy's own Season work: the same
 * report is handed to every subscriber in turn and the economy's is first, so
 * what Attrition charges the army for is the Season it has just spent where it
 * stands. A Squad worn down to nobody leaves the list, exactly as one that
 * desertion or a fight takes to nobody does — which is the ticket's "a Faction
 * that overextends without supply loses the force it overextended with".
 *
 * The men lost are not laid on the field as residue: they are stragglers, the
 * sick and the starved, not men who fell in the line, and `sim/residue.ts` is
 * what a battle leaves behind. What a Faction reads is the Squad's `men`, which
 * the Observation carries either way.
 */
export function applyAttrition(economy: Economy, season: Season): void {
  const kept: Squad[] = [];

  for (const squad of economy.squads) {
    const percent = attritionPercent(economy, squad, season);
    if (percent === 0) {
      kept.push(squad);
      continue;
    }

    squad.strength -= menLost(squad.strength, percent);
    if (squad.strength > 0) kept.push(squad);
  }

  economy.squads = kept;
}

/**
 * The men a percent of a Squad costs it: at least one, so a Season outside never
 * costs nothing at all.
 *
 * The floor is what makes a small force dissolve rather than be immune: two
 * percent of a Squad of twenty men rounds to nobody, and a Squad that pays
 * nothing for a whole campaign would make the Territory it stands outside of
 * worth nothing either.
 */
function menLost(strength: number, percent: number): number {
  return Math.max(1, Math.floor((strength * percent) / 100));
}

/** Whether a settlement has a standing camp in it: a Castrum, built and done (C6). */
function hasCamp(settlement: Settlement): boolean {
  return settlement.works.some((work) => work.remaining === 0 && work.building === CAMP);
}

/** A whole field body inside an owned inhabited core, or a protected wall defender. */
function insideSettlement(economy: Economy, squad: Squad): boolean {
  if (squad.garrison !== FIELD) return true;
  const body = squadGround(squad);
  return economy.settlements.some((settlement) => {
    if (settlement.owner !== squad.owner) return false;
    const core = coreOf(economy, settlement);
    const inset = settlement.id < 2 ? 1 : 0;
    const shelter = { x: core.x + inset, y: core.y + inset,
      width: core.width - inset * 2, height: core.height - inset * 2 };
    return containsTile(shelter, body.x, body.y) &&
      containsTile(shelter, body.x + body.width - 1, body.y + body.height - 1);
  });
}

/** Whether a Squad is within `radius` tiles of a site, counting Chebyshev, as `siege.ts`'s `inReach` does. */
function within(squad: Site, settlement: Site, radius: number): boolean {
  return Math.max(Math.abs(squad.x - settlement.x), Math.abs(squad.y - settlement.y)) <= radius;
}

/** What the grid depends on: the owner of every settlement, in the economy's own order. */
function ownershipKey(economy: Economy): string {
  return economy.settlements.map((settlement) => String(settlement.owner)).join(',');
}

/**
 * Walks every held settlement's square and gives each tile to the nearest one.
 *
 * A tile already claimed at a distance no further than this settlement is left
 * alone, which is both the nearest-claim rule and the tie-break: settlements are
 * walked in the economy's own order — the Strongholds first, Rome's before
 * Carthage's — so the first of two settlements equally near a tile keeps it.
 */
function inferOwners(economy: Economy): Int8Array {
  const owners = new Int8Array(TILE_COUNT);
  owners.fill(UNOWNED);

  const claimed = new Int16Array(TILE_COUNT);
  claimed.fill(TERRITORY_RADIUS + 1);

  for (const settlement of economy.settlements) {
    if (!isHeld(settlement)) continue;

    const top = Math.max(0, settlement.y - TERRITORY_RADIUS);
    const bottom = Math.min(MAP_HEIGHT - 1, settlement.y + TERRITORY_RADIUS);

    for (let y = top; y <= bottom; y += 1) {
      const left = Math.max(0, settlement.x - TERRITORY_RADIUS);
      const right = Math.min(MAP_WIDTH - 1, settlement.x + TERRITORY_RADIUS);

      for (let x = left; x <= right; x += 1) {
        const away = Math.max(Math.abs(x - settlement.x), Math.abs(y - settlement.y));
        const tile = tileIndex(x, y);
        if (away >= (claimed[tile] ?? 0)) continue;

        claimed[tile] = away;
        owners[tile] = settlement.owner;
      }
    }
  }

  return owners;
}
