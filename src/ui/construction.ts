/** Construction decisions, read from content; no Match state or hidden quantities. */
import { BUILDINGS, amountOf, squadTypesOf, type BuildingType } from '../content/index.ts';
import { RESOURCE_KINDS } from '../sim/map.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { CAMP_RADIUS } from '../sim/territory.ts';
import { message, resourceLabel, squadLabel, workLabel, translate, type StringKey } from './strings.ts';

export type ConstructionCategory = 'production' | 'economy' | 'development' | 'military';

export const CONSTRUCTION_CATEGORIES: readonly {
  id: ConstructionCategory; label: StringKey; buildings: readonly string[];
}[] = [
  { id: 'production', label: 'category.production', buildings: ['farm', 'lumber-camp', 'quarry', 'mine'] },
  { id: 'economy', label: 'category.economy', buildings: ['market', 'granary'] },
  { id: 'development', label: 'category.development', buildings: ['house', 'villa', 'forum'] },
  { id: 'military', label: 'category.military', buildings: ['castrum'] },
];

export function categoryOf(building: string): ConstructionCategory | undefined {
  return CONSTRUCTION_CATEGORIES.find((category) => category.buildings.includes(building))?.id;
}

/** A bill with units, shared by offers and the reference. */
export function resourceBill(amounts: BuildingType['cost']): string {
  return RESOURCE_KINDS.filter((kind) => amountOf(amounts, kind) > 0)
    .map((kind) => `${amountOf(amounts, kind)} ${resourceLabel(kind)}`).join(', ') || translate('ui.none');
}

/** Complete building terms: conditional output, passive limits and actual unlocks. */
export function buildingDescription(building: BuildingType): string {
  const parts = [message('economy.buildTerms', { cost: resourceBill(building.cost), seconds: building.buildTicks / TICK_HZ,
    workers: building.labour, tier: building.tier, max: building.maxPerSettlement })];
  if (RESOURCE_KINDS.some((kind) => amountOf(building.yields, kind) > 0)) {
    parts.push(message('economy.potential', { yield: resourceBill(building.yields) }));
  }
  if (building.denarii > 0) parts.push(message('economy.denarii', { amount: building.denarii }));
  if (building.housing > 0) parts.push(message('economy.housing', { amount: building.housing }));
  if (building.storage > 0) parts.push(message('economy.storage', { amount: building.storage }));
  if (building.raisesTier > 0) {
    const unlocks = [...BUILDINGS.filter((item) => item.tier === building.raisesTier).map((item) => workLabel(item.id)), ...(['rome', 'carthage'] as const).flatMap((faction) => squadTypesOf(faction)
      .filter((type) => type.tier === building.raisesTier).map((type) => squadLabel(type.id)))];
    parts.push(message('economy.progression', { tier: building.raisesTier, unlocks: unlocks.join(', ') }));
  }
  if (building.id === 'castrum') parts.push(message('economy.camp', { radius: CAMP_RADIUS }));
  return parts.join(' ');
}
