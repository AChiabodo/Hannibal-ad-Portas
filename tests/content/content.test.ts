import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingCode,
  buildingOf,
  SQUAD_TYPES,
  squadTypeCode,
  squadTypeOf,
  squadTypesOf,
} from '../../src/content';
import { FACTIONS } from '../../src/sim/faction';

const PATH = fileURLToPath(new URL('../../docs/COMMANDS.md', import.meta.url));
const DOCUMENT = readFileSync(PATH, 'utf8');

describe('the Squad types content ships', () => {
  it('gives every type an id nothing else claims, so a Recruit that names one names one thing', () => {
    const ids = SQUAD_TYPES.map((type) => type.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('reads an id back as the same type it names, through the integer state holds', () => {
    for (const [code, type] of SQUAD_TYPES.entries()) {
      expect(squadTypeCode(type.id)).toBe(code);
      expect(squadTypeOf(code)).toBe(type);
    }

    expect(squadTypeOf(SQUAD_TYPES.length)).toBeUndefined();
    expect(squadTypeCode('no-such-type')).toBeUndefined();
  });

  it('gives every type a tier, men, morale, Payroll and a cost no field of which is negative', () => {
    for (const type of SQUAD_TYPES) {
      expect([1, 2, 3], type.id).toContain(type.tier);
      expect(type.strength, type.id).toBeGreaterThan(0);
      expect(type.morale, type.id).toBeGreaterThan(0);
      expect(type.payroll, type.id).toBeGreaterThan(0);
      expect(type.cost.grain, type.id).toBeGreaterThanOrEqual(0);
      expect(type.cost.timber, type.id).toBeGreaterThanOrEqual(0);
      expect(type.cost.stone, type.id).toBeGreaterThanOrEqual(0);
      expect(type.cost.iron, type.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives each Faction a type at every tier, so the three tiers gate something real', () => {
    for (const faction of FACTIONS) {
      const tiers = new Set(squadTypesOf(faction).map((type) => type.tier));

      expect([...tiers].sort(), faction).toEqual([1, 2, 3]);
      expect(squadTypesOf(faction).every((type) => type.faction === faction)).toBe(true);
    }
  });
});

describe('the buildings content ships', () => {
  it('gives every building an id nothing else claims, and reads it back as the same building', () => {
    const ids = BUILDINGS.map((building) => building.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);

    for (const [code, building] of BUILDINGS.entries()) {
      expect(buildingCode(building.id)).toBe(code);
      expect(buildingOf(code)).toBe(building);
    }

    expect(buildingOf(BUILDINGS.length)).toBeUndefined();
    expect(buildingCode('no-such-building')).toBeUndefined();
  });

  it('gives every building a cost, a timer, a labour demand and a place in the tiers', () => {
    for (const building of BUILDINGS) {
      expect([1, 2, 3], building.id).toContain(building.tier);
      expect(building.buildTicks, building.id).toBeGreaterThan(0);
      expect(building.labour, building.id).toBeGreaterThanOrEqual(0);
      expect(building.maxPerSettlement, building.id).toBeGreaterThanOrEqual(1);
      expect([0, 2, 3], building.id).toContain(building.raisesTier);
      expect(building.cost.grain, building.id).toBeGreaterThanOrEqual(0);
      expect(building.cost.timber, building.id).toBeGreaterThanOrEqual(0);
      expect(building.cost.stone, building.id).toBeGreaterThanOrEqual(0);
      expect(building.cost.iron, building.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('raises a settlement exactly one tier at a time, and never past the third', () => {
    const raisers = BUILDINGS.filter((building) => building.raisesTier !== 0);

    expect(raisers.map((building) => [building.id, building.tier, building.raisesTier])).toEqual([
      ['villa', 1, 2],
      ['forum', 2, 3],
    ]);
  });

  it('keeps Rome’s Castrum Roman, because the plan gives Carthage no castrum', () => {
    const castrum = BUILDINGS.find((building) => building.id === 'castrum');

    expect(castrum?.faction).toBe('rome');
  });
});

describe('the ids the Command documentation shows', () => {
  it('names buildings and Squad types the content table actually has', () => {
    const named = [...DOCUMENT.matchAll(/"building":\s*"([^"]+)"/g)].map((match) => match[1] ?? '');
    const types = [...DOCUMENT.matchAll(/"squadType":\s*"([^"]+)"/g)].map((match) => match[1] ?? '');

    expect(named.length).toBeGreaterThan(0);
    expect(types.length).toBeGreaterThan(0);

    for (const id of named) expect(buildingCode(id), id).toBeDefined();
    for (const id of types) expect(squadTypeCode(id), id).toBeDefined();
  });
});
