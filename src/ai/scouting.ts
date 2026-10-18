import type { Observation } from '../sim/observation.ts';
import type { Behaviour } from './registry.ts';

interface Site { readonly x: number; readonly y: number }
export interface Contact extends Site {
  readonly id: number;
  readonly kind: 'squad' | 'settlement' | 'stronghold';
  readonly seen: number;
  readonly type: string | null;
}
export interface ScoutingObservation {
  readonly year: number;
  readonly season: string;
  readonly fog: { readonly terrain: Uint8Array; readonly visible: Uint8Array };
  readonly contacts: readonly Contact[];
  readonly settlements: readonly Site[];
  readonly enemies: readonly Site[];
  readonly squads: readonly (Site & {
    readonly id: number; readonly type: string; readonly men: number; readonly morale: number;
    readonly routing: boolean; readonly engaged: boolean; readonly garrison: number | null;
    readonly goal: Site | null; readonly refused: string | null;
  })[];
}
export interface ScoutingContent {
  readonly width: number;
  readonly height: number;
  readonly unseen: number;
  readonly water: number;
  readonly vision: number;
  readonly ticksPerSecond: number;
  readonly scoutTypes: readonly string[];
  readonly squadTypes: readonly {
    readonly id: string;
    readonly strength: number; readonly morale: number; readonly pace: number;
  }[];
}
type Move = { readonly kind: 'move'; readonly faction: Observation<unknown>['faction'];
  readonly squads: readonly number[]; readonly x: number; readonly y: number };

/** Stale sightings remain historical fog data, but cease to be planning evidence. */
export function planningContacts(contacts: readonly Contact[], tick: number, ticksPerSecond: number): Contact[] {
  return contacts.filter((contact) => tick >= contact.seen &&
    tick - contact.seen < ticksPerSecond * (contact.kind === 'squad' ? 120 : 600));
}

/** A light detachment explores reachable known ground at the edge of the unknown. */
export function createScoutingBehaviour(content: ScoutingContent): Behaviour<ScoutingObservation, Move> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  const { width, height, vision } = content;
  const index = (site: Site) => site.y * width + site.x;
  const distance = (a: Site, b: Site) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  function withinVision(a: Site, b: Site): boolean {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= vision * vision;
  }
  function neighbours(tile: number): number[] {
    const x = tile % width;
    const y = Math.floor(tile / width);
    return [x > 0 ? tile - 1 : -1, x + 1 < width ? tile + 1 : -1,
      y > 0 ? tile - width : -1, y + 1 < height ? tile + width : -1].filter((at) => at >= 0);
  }
  return { id: 'scouting', tactical: ({ observation }) => {
    const { visible, tick, faction } = observation;
    const contacts = planningContacts(visible.contacts, tick, content.ticksPerSecond);
    const found = contacts.some((contact) => contact.kind === 'stronghold');
    const quota = Math.max(1, Math.ceil(visible.squads.length / (found ? 8 : 3)));
    const scouts = visible.squads.filter((squad) => {
      const type = types.get(squad.type);
      const light = type !== undefined && content.scoutTypes.includes(type.id);
      return light && !squad.routing && !squad.engaged && squad.garrison === null &&
        squad.men * 2 > type.strength && squad.morale * 2 > type.morale &&
        !visible.enemies.some((enemy) => distance(squad, enemy) <= vision + 1) &&
        !(squad.goal !== null && visible.settlements.some((home) => distance(home, squad.goal!) === 0));
    }).sort((a, b) => (types.get(b.type)!.pace - types.get(a.type)!.pace) || a.id - b.id).slice(0, quota);
    const terrain = visible.fog.terrain;
    const walkable = (tile: number) => terrain[tile] !== content.unseen && terrain[tile] !== content.water;
    function gain(tile: number): number {
      const x = tile % width;
      const y = Math.floor(tile / width);
      let unknown = 0;
      for (let dy = -vision; dy <= vision; dy += 1) {
        for (let dx = -vision; dx <= vision; dx += 1) {
          if (dx * dx + dy * dy > vision * vision || x + dx < 0 || x + dx >= width ||
            y + dy < 0 || y + dy >= height) continue;
          if (terrain[(y + dy) * width + x + dx] === content.unseen) unknown += 1;
        }
      }
      return unknown;
    }
    const commands: Move[] = [];
    const reasons: string[] = [];
    const targets: Site[] = [];
    for (const squad of scouts) {
      let target: Site | undefined;
      // Keep a march while its destination can reveal ground or refresh a contact.
      if (squad.goal !== null && squad.refused === null && walkable(index(squad.goal)) &&
        (gain(index(squad.goal)) > 0 || contacts.some((contact) => withinVision(contact, squad.goal!) &&
          visible.fog.visible[index(contact)] !== 1))) target = squad.goal;
      else {
        const distances = new Int32Array(width * height).fill(-1);
        const queue = [index(squad)];
        distances[queue[0]!] = 0;
        let best = -Infinity;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          const tile = queue[cursor]!;
          const site = { x: tile % width, y: Math.floor(tile / width) };
          const travel = distances[tile]!;
          if (travel > 0 && !targets.some((other) => distance(other, site) < vision * 2)) {
            const refresh = contacts.some((contact) => tick - contact.seen >= content.ticksPerSecond * 30 &&
              withinVision(contact, site) && visible.fog.visible[index(contact)] !== 1);
            const unknown = gain(tile);
            if (unknown > 0 || refresh) {
              const central = Math.min(site.x, width - 1 - site.x, site.y, height - 1 - site.y);
              const home = visible.settlements[0] ?? squad;
              const outward = distance(home, site);
              const score = Math.floor(((unknown + (refresh ? 60 : 0)) * 100 + central * 10) *
                (10 + outward) / (travel + 10));
              if (score > best) { best = score; target = site; }
            }
          }
          for (const next of neighbours(tile)) {
            if (distances[next] !== -1 || !walkable(next)) continue;
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
