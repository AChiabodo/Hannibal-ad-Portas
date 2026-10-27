/** Authoritative camp resistance and explicit orders from the ordinary Command seam. */
import { squadTypeOf } from '../content/squads.ts';
import type { Command } from './command.ts';
import { engagedWith, EXCHANGE_TICKS } from './combat.ts';
import { eyesOfEconomy } from './economy-match.ts';
import { factionCode } from './faction.ts';
import { eyeCovers } from './fog.ts';
import { MAP_WIDTH } from './map.ts';
import { orderedSquads, orderSquadTo, routeCacheFor } from './movement.ts';
import type { SiegeWorld } from './siege.ts';
import { NO_REFUSAL } from './route.ts';
import { FIELD, isRouting } from './squad.ts';

export interface BarbarianCampState { hp: number }
export interface CampAttackOrder { readonly squad: number; readonly target: number; readonly owner: number }
export const CAMP_MAX_HP = 60;
export const CAMP_REWARD = 20;

/** New worlds initialize every generated camp; fixtures may opt into the same state. */
export function openBarbarianCamps(world: SiegeWorld): void {
  world.barbarianCamps ??= (world.map.barbarianCamps ?? []).map(() => ({ hp: CAMP_MAX_HP }));
  world.campOrders ??= [];
}

/** Orders are explicitly given; another order for a squad cancels its camp attack. */
export function orderCampAttacks(world: SiegeWorld, commands: readonly Command[]): void {
  openBarbarianCamps(world);
  for (const command of commands) {
    if ('squads' in command && command.kind !== 'formation' && command.kind !== 'group') {
      const owner = factionCode(command.faction);
      world.campOrders = world.campOrders!.filter((order) => order.owner !== owner || !command.squads.includes(order.squad));
    }
    if (command.kind !== 'attackStructure') continue;
    const site = world.map.barbarianCamps?.[command.target.id];
    const camp = world.barbarianCamps?.[command.target.id];
    if (site === undefined || camp === undefined || camp.hp <= 0 ||
      world.fog[command.faction].visible[site.y * MAP_WIDTH + site.x] !== 1) continue;
    const owner = factionCode(command.faction);
    for (const squad of orderedSquads(world.economy, owner, command.squads)) {
      if (squad.garrison !== FIELD) continue;
      orderSquadTo(world.map, squad, site, routeCacheFor(world.map));
      if (squad.refused === NO_REFUSAL) world.campOrders!.push({ squad: squad.id, target: command.target.id, owner });
    }
  }
}

/** Resolve blows in order; the final blow awards one faction exactly once. */
export function advanceCampAttacks(world: SiegeWorld, tick: number): void {
  const orders = world.campOrders ?? [];
  const kept: CampAttackOrder[] = [];
  const eyes = { rome: eyesOfEconomy(world, 'rome'), carthage: eyesOfEconomy(world, 'carthage') };
  for (const order of orders) {
    const site = world.map.barbarianCamps?.[order.target];
    const camp = world.barbarianCamps?.[order.target];
    const squad = world.economy.squads.find((candidate) => candidate.id === order.squad && candidate.owner === order.owner);
    const faction = order.owner === 0 ? 'rome' : 'carthage';
    if (site === undefined || camp === undefined || camp.hp <= 0 || squad === undefined || squad.strength <= 0 ||
      squad.garrison !== FIELD || isRouting(squad) || !eyes[faction].some((eye) => eyeCovers(eye, site))) {
      if (squad !== undefined && squad.garrison === FIELD && !isRouting(squad)) {
        squad.steps = [];
        squad.wait = 0;
      }
      continue;
    }
    kept.push(order);
    if (engagedWith(world.economy, squad) !== undefined) continue;
    const type = squadTypeOf(squad.type);
    const reach = type?.arm === 'archers' ? 4 : 2;
    if (Math.max(Math.abs(squad.x - site.x), Math.abs(squad.y - site.y)) > reach || tick % EXCHANGE_TICKS !== 0) continue;
    camp.hp = Math.max(0, camp.hp - (type?.arm === 'cavalry' ? 2 : 4));
    if (camp.hp === 0) world.economy.treasuries[order.owner] = (world.economy.treasuries[order.owner] ?? 0) + CAMP_REWARD;
  }
  world.campOrders = kept.filter((order) => {
    if ((world.barbarianCamps?.[order.target]?.hp ?? 0) > 0) return true;
    const squad = world.economy.squads.find((candidate) => candidate.id === order.squad && candidate.owner === order.owner);
    if (squad !== undefined && !isRouting(squad)) { squad.steps = []; squad.wait = 0; }
    return false;
  });
}
