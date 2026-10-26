import { formationFootprint } from '../content/formation.ts';
import { breachTile } from '../content/settlement-layout.ts';
import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import type { Observation } from '../sim/observation.ts';
import type { Season } from './calendar.ts';
import { atHalfStrength, type Behaviour } from './registry.ts';
import { planningContacts, permittedContacts, type Contact } from './contacts.ts';
import { DIFFICULTY, type Difficulty } from './difficulty.ts';
import { distance, type Site } from './site.ts';
import { restingAtHome, returningHome } from './recovery.ts';

export interface ScoutingObservation {
  readonly appearances?: readonly ObservedSettlement[];
  readonly year: number;
  readonly season: Season;
  readonly fog: { readonly terrain: Uint8Array; readonly visible: Uint8Array };
  readonly contacts: readonly Contact[];
  readonly settlements: readonly (Site & { readonly id?: number })[];
  readonly enemies: readonly Site[];
  readonly squads: readonly (Site & {
    readonly id: number; readonly type: string; readonly men: number; readonly capacity: number; readonly morale: number;
    readonly routing: boolean; readonly engaged: boolean; readonly garrison: number | null;
    readonly passage?: { readonly settlement: number; readonly phase: string }; readonly goal: Site | null; readonly refused: string | null;
  })[];
}
export interface ScoutingContent {
  readonly width: number;
  readonly height: number;
  readonly unseen: number;
  readonly water: number;
  readonly vision: number;
  readonly settlementRadius?: number;
  readonly ticksPerSecond: number;
  readonly scoutTypes: readonly string[];
  readonly squadTypes: readonly {
    readonly id: string;
    readonly strength: number; readonly morale: number; readonly pace: number;
  }[];
}
type Move = { readonly kind: 'move'; readonly faction: Observation<unknown>['faction'];
  readonly squads: readonly number[]; readonly x: number; readonly y: number };

/**
 * A light detachment explores reachable known ground at the edge of the unknown.
 *
 * What this behaviour decides is a function of the Observation and nothing else —
 * it is handed the whole context and reads only `observation`, which the
 * composition root can see and rely on when it asks for the same plan twice in a
 * tick (E3).
 */
export function createScoutingBehaviour(content: ScoutingContent, difficulty: Difficulty = DIFFICULTY.centurio): Behaviour<ScoutingObservation, Move> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  const { width, height, vision } = content;
  const index = (site: Site) => site.y * width + site.x;
  function withinVision(a: Site, b: Site): boolean {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= vision * vision;
  }
  /**
   * How much unknown ground stands within vision of every tile, in one pass.
   *
   * The search below asks this of every tile it walks, and a whole-map walk asks
   * it of nine thousand of them: scanning the disc around each one is how a
   * Match spent nineteen of its twenty seconds, because a *tactical* decision is
   * taken on every tick and a Match is tens of thousands of ticks (E3's own
   * finding). Nothing about the answer changes here — it is the same count of the
   * same unseen tiles, from the same `terrain` — only the number of times each
   * tile is looked at: a row of the map is summed once, and a disc is then a
   * handful of those sums subtracted from each other.
   *
   * The disc is cut into rows here for exactly that reason: for a row `dy` away
   * the disc is wide by `w`, where `w * w + dy * dy <= vision * vision`, and the
   * row's half-width is found by counting up rather than by a square root, so the
   * whole thing stays in integers (ADR-0006).
   */
  function unknownNear(terrain: Uint8Array): Int32Array {
    const halfWidths: number[] = [];
    for (let dy = -vision; dy <= vision; dy += 1) {
      let half = 0;
      while ((half + 1) * (half + 1) + dy * dy <= vision * vision) half += 1;
      halfWidths.push(half);
    }

    // `rows[row * width + x]`: how many unseen tiles the row has up to `x`.
    const rows = new Int32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const origin = y * width;
      let running = 0;
      for (let x = 0; x < width; x += 1) {
        if (terrain[origin + x] === content.unseen) running += 1;
        rows[origin + x] = running;
      }
    }

    const gains = new Int32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let unknown = 0;
        for (let dy = -vision; dy <= vision; dy += 1) {
          const row = y + dy;
          if (row < 0 || row >= height) continue;
          const half = halfWidths[dy + vision]!;
          const low = Math.max(0, x - half);
          const high = Math.min(width - 1, x + half);
          const origin = row * width;
          unknown += rows[origin + high]! - (low === 0 ? 0 : rows[origin + low - 1]!);
        }
        gains[y * width + x] = unknown;
      }
    }

    return gains;
  }
  /** Cover the opposite band systematically, deriving progress only from explored terrain. */
  function explorationCourse(home: Site, patrol: number, terrain: Uint8Array, position: Site): Site | undefined {
    const margin = Math.max(vision, (content.settlementRadius ?? 0) + vision);
    const low = Math.min(margin, Math.floor(height / 2));
    const high = Math.max(low, height - 1 - margin);
    const opposite = Math.max(vision, Math.min(width - 1 - vision, width - 1 - home.x));
    const ownLatitude = Math.max(low, Math.min(high, home.y));
    // The leading patrol crosses towards the middle, then sweeps away from
    // home latitude. The second crosses at home latitude and covers the other end.
    // A ford may already have carried the patrol farther along its sweep.
    // Keep that progress instead of crossing the same river again to visit an
    // arbitrary latitude before continuing in the original direction.
    const middle = Math.floor(height / 2);
    const first = patrol % 2 === 0
      ? Math.max(low, Math.min(high, ownLatitude >= middle ? Math.min(middle, position.y) : Math.max(middle, position.y)))
      : ownLatitude;
    const northFirst = patrol % 2 === 0 ? ownLatitude >= height / 2 : first < height / 2;
    const samples: number[] = [];
    for (let y = low; y <= high; y += Math.max(1, vision * 2)) samples.push(y);
    if (samples.at(-1) !== high) samples.push(high);
    const initial = samples.filter((y) => northFirst ? y < first : y > first)
      .sort((one, other) => northFirst ? other - one : one - other);
    const reverse = [...samples].sort((one, other) => northFirst ? one - other : other - one);
    const inward = opposite < width / 2 ? vision * 2 : -vision * 2;
    const columns = [opposite, opposite + inward, opposite - inward];
    for (const x of columns) {
      if (x < 0 || x >= width) continue;
      for (const y of [first, ...initial, ...reverse]) {
        if (terrain[y * width + x] === content.unseen) return { x, y };
      }
    }
    return undefined;
  }
  return { id: 'scouting', tactical: ({ observation }) => {
    const { visible, tick, faction } = observation;
    // Open settlements belong to expansion; stationary villages must not pull
    // the discovery patrol away from the enemy's Stronghold on every refresh.
    const contacts = planningContacts(permittedContacts(visible), tick, content.ticksPerSecond)
      .filter((contact) => contact.kind !== 'settlement');
    const found = contacts.some((contact) => contact.kind === 'stronghold');
    const wallKnowledge = (contact: Contact) => visible.appearances?.find((site) => site.id === contact.id)?.tiles
      .filter((tile) => tile.structure !== undefined);
    const needsRefresh = (contact: Contact) => {
      const walls = contact.kind === 'stronghold' ? wallKnowledge(contact) : undefined;
      const nowSeen = walls === undefined ? visible.fog.visible[index(contact)] === 1 : walls.some((tile) => tile.visible);
      return !nowSeen && (walls?.length === 0 || tick - contact.seen >= content.ticksPerSecond * difficulty.refreshSeconds);
    };
    const contactCovered = (contact: Contact, site: Site) => {
      if (contact.kind !== 'stronghold' || !content.settlementRadius) return withinVision(contact, site);
      const radius = content.settlementRadius;
      return withinVision(site, { x: Math.max(contact.x - radius, Math.min(contact.x + radius, site.x)),
        y: Math.max(contact.y - radius, Math.min(contact.y + radius, site.y)) });
    };
    const quota = Math.max(found ? 1 : difficulty.openingScouts,
      Math.ceil(visible.squads.length / (found ? difficulty.scoutsPerFound : difficulty.scoutsPer)));
    const scouts = visible.squads.filter((squad) => {
      const type = types.get(squad.type);
      const light = type !== undefined && content.scoutTypes.includes(type.id);
      return light && !squad.routing && !squad.engaged && squad.garrison === null &&
        !restingAtHome(squad, visible.settlements, type.morale) &&
        !atHalfStrength(squad) && squad.morale * 2 > type.morale &&
        !visible.enemies.some((enemy) => distance(squad, enemy) <= vision + 1) &&
        !returningHome(squad, visible.settlements);
    }).sort((a, b) => (types.get(b.type)!.pace - types.get(a.type)!.pace) || a.id - b.id).slice(0, quota);
    const terrain = visible.fog.terrain;
    const unseen = content.unseen;
    const water = content.water;
    const obstacles = new Uint8Array(width * height);
    const owned = new Set(visible.settlements.map((site) => site.id));
    for (const site of visible.appearances ?? []) for (const tile of site.tiles) {
      const localX = tile.cell % 25 - 12, localY = Math.floor(tile.cell / 25) - 12;
      const x = site.x + localX, y = site.y + localY;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const part = tile.structure;
      const tangent = part?.side === 0 || part?.side === 2 ? localX : localY;
      const gap = part?.condition === 'breached' && (part.kind === 'gate' || breachTile(site.gateSide, part.side, tangent));
      const obstacle = tile.work !== undefined || (part !== undefined && !gap && !(part.kind === 'gate' && owned.has(site.id)));
      if (obstacle) obstacles[index({ x, y })] = 1;
    }
    /** Both the known ground and the recorded physical obstacles constrain a patrol. */
    const blocked = (tile: number) => terrain[tile] === unseen || terrain[tile] === water || obstacles[tile] === 1;
    const walkable = (tile: number) => !blocked(tile);
    let gains: Int32Array | null = null;
    function gain(tile: number): number {
      gains ??= unknownNear(terrain);

      return gains[tile]!;
    }
    const commands: Move[] = [];
    const reasons: string[] = [];
    const targets: Site[] = [];
    for (const [patrol, squad] of scouts.entries()) {
      const course = found ? undefined : explorationCourse(visible.settlements[0] ?? squad, patrol, terrain, squad);
      const fits = new Int8Array(width * height).fill(-1);
      // An anchor on dry ground is insufficient: at least one column pose must fit.
      const arrivals = (['north', 'east', 'south', 'west'] as const).map((facing) => formationFootprint(squad.capacity, 'column', facing));
      function canArrive(tile: number): boolean {
        if (fits[tile] !== -1) return fits[tile] === 1;
        const x = tile % width, y = Math.floor(tile / width);
        const safe = arrivals.some((rect) => {
          for (let row = y + rect.y; row < y + rect.y + rect.height; row += 1)
            for (let col = x + rect.x; col < x + rect.x + rect.width; col += 1)
              if (row < 0 || col < 0 || row >= height || col >= width || blocked(row * width + col)) return false;
          return true;
        });
        fits[tile] = safe ? 1 : 0;
        return safe;
      }
      let target: Site | undefined;
      // Finish an accepted safe leg before choosing the next frontier. Replanning
      // when its last unknown tiles enter vision can oscillate between banks.
      if (squad.goal !== null && squad.refused === null && walkable(index(squad.goal)) && canArrive(index(squad.goal))) target = squad.goal;
      else {
        // Unknown terrain is a possible continuation, never a movement goal.
        // Observed rivers bend this estimate around their known banks, avoiding
        // repeated trips between equally informative ends of the same bank.
        const guidance = new Int32Array(width * height).fill(-1);
        if (course !== undefined) {
          const open = [index(course)];
          guidance[open[0]!] = 0;
          for (let cursor = 0; cursor < open.length; cursor += 1) {
            const tile = open[cursor]!, x = tile % width;
            for (const next of [x > 0 ? tile - 1 : -1, x + 1 < width ? tile + 1 : -1,
              tile >= width ? tile - width : -1, tile + width < width * height ? tile + width : -1]) {
              if (next < 0 || guidance[next] !== -1 || terrain[next] === water || obstacles[next] === 1) continue;
              guidance[next] = guidance[tile]! + 1;
              open.push(next);
            }
          }
        }
        const distances = new Int32Array(width * height).fill(-1);
        const queue = [index(squad)];
        distances[queue[0]!] = 0;
        let best = -Infinity;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const tile = queue[cursor]!;
          // Exact integer division for a tile of this map: `tile` is never negative.
          const x = tile % width;
          const y = (tile - x) / width;
          const site = { x, y };
          const travel = distances[tile]!;
          if (travel > 0 && !targets.some((other) => distance(other, site) < vision * 2)) {
            const refresh = contacts.some((contact) => contactCovered(contact, site) && needsRefresh(contact));
            const unknown = gain(tile);
            if ((unknown > 0 || refresh) && canArrive(tile)) {
              const central = Math.min(site.x, width - 1 - site.x, site.y, height - 1 - site.y);
              const home = visible.settlements[0] ?? squad;
              const outward = distance(home, site);
              // A coarse public-map course prevents profitable local frontiers
              // from postponing whole latitude bands indefinitely.
              const remaining = course === undefined ? 0 : guidance[tile]! < 0 ? width * height : guidance[tile]!;
              const score = Math.floor(((unknown + (refresh ? 60 : 0)) * 100 + central * 10) *
                (10 + outward) / (travel + 10)) - (course === undefined ? 0 : travel + remaining) * 10000;
              if (score > best) { best = score; target = site; }
            }
          }
          // The four neighbours are stood here rather than in an array, in the
          // order `neighbours` used to list them: left, right, up, down. A whole
          // theatre is walked for each light Squad on every tick, and building and
          // filtering an array per tile was a measurable part of what that cost
          // (E3). The `-1` is the same "off the map" the filter used to drop.
          for (let direction = 0; direction < 4; direction += 1) {
            const next = direction === 0 ? (x > 0 ? tile - 1 : -1)
              : direction === 1 ? (x + 1 < width ? tile + 1 : -1)
                : direction === 2 ? (y > 0 ? tile - width : -1)
                  : (y + 1 < height ? tile + width : -1);
            if (next < 0 || distances[next] !== -1 || blocked(next)) continue;
            distances[next] = travel + 1;
            queue.push(next);
          }
        }
      }
      if (target === undefined) continue;
      targets.push(target);
      commands.push({ kind: 'move', faction, squads: [squad.id], x: target.x, y: target.y });
      reasons.push(`Scout ${squad.id} to (${target.x}, ${target.y}); frontier exploration or contact refresh.`);
    }
    return commands.length === 0 ? [] : [{ id: found ? 'patrol' : 'explore', utility: 21,
      reason: `${found ? 'Enemy Stronghold observed; reduce scouting' : 'Locate the enemy Stronghold'}: quota ${quota}. ${reasons.join(' ')}`,
      commands }];
  } };
}
