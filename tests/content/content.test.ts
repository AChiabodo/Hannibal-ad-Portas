import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  COST_BASIS,
  PAYROLL_BASIS,
  buildingCode,
  buildingOf,
  figuresOf,
  isLegalSize,
  payrollBill,
  recruitCost,
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

  it('raises the six Carthaginian types the ticket names, and no Roman stand-ins', () => {
    expect(squadTypesOf('carthage').map((type) => type.id)).toEqual([
      'libyan-spear',
      'gaul',
      'iberian-sword',
      'balearic-slinger',
      'numidian-horse',
      'elephant',
    ]);
  });

  it('gives every type a pace of a whole tile or more, and neither Faction a walker it cannot rout', () => {
    for (const type of SQUAD_TYPES) {
      expect(Number.isInteger(type.pace), type.id).toBe(true);
      expect(type.pace, type.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('draws a body of men at its strength and a beast as one figure', () => {
    for (const type of SQUAD_TYPES) {
      const figures = figuresOf(type, type.strength);

      expect(Number.isInteger(figures), type.id).toBe(true);
      expect(figures, type.id).toBeGreaterThan(0);
      expect(figures, type.id).toBeLessThanOrEqual(type.strength);
      // A type that says nothing draws one figure per man it has left; the
      // elephant is the one type whose one figure is worth a body of men.
      if (type.id !== 'elephant') {
        expect(figures, type.id).toBe(type.strength);
        // And it thins as it is worn down, which is what visible attrition is.
        expect(figuresOf(type, type.strength - 1), type.id).toBe(type.strength - 1);
      } else {
        expect(figuresOf(type, 5), type.id).toBe(1);
      }
    }

    expect(squadTypeOf(squadTypeCode('elephant') ?? -1)?.figures).toBe(1);
  });

  it('makes the Numidian horse light, mobile cavalry rather than a line to hold', () => {
    const horse = squadTypeOf(squadTypeCode('numidian-horse') ?? -1);
    const romanPaces = squadTypesOf('rome').map((type) => type.pace);

    expect(horse?.arm).toBe('cavalry');
    // Faster than anything Rome fields, and carrying missiles rather than a
    // shield wall: what "harasses and will not hold a line" is made of.
    expect(horse?.pace).toBeGreaterThan(Math.max(...romanPaces));
    expect(horse?.ammunition).toBeGreaterThan(0);
    expect(horse?.strength).toBeLessThan(Math.min(...squadTypesOf('rome').map((type) => type.strength)));
  });

  it('gives the elephant one figure and a body of men\'s staying power, at the dearest Payroll', () => {
    const elephant = squadTypeOf(squadTypeCode('elephant') ?? -1);

    expect(elephant?.figures).toBe(1);
    expect(elephant?.strength).toBeGreaterThan(1);
    expect(elephant?.morale).toBeGreaterThan(Math.max(...squadTypesOf('rome').map((type) => type.morale)));
    expect(elephant?.payroll).toBe(Math.max(...SQUAD_TYPES.map((type) => type.payroll)));
  });

  it('gives every type only its real sizes, smallest first and its full strength last', () => {
    for (const type of SQUAD_TYPES) {
      expect(type.sizes.length, type.id).toBeGreaterThan(0);
      expect(type.sizes, type.id).toEqual([...type.sizes].sort((a, b) => a - b));
      expect(type.sizes.at(-1), type.id).toBe(type.strength);
      expect(new Set(type.sizes).size, type.id).toBe(type.sizes.length);
      expect(type.sizes.every((men) => Number.isInteger(men) && men > 0), type.id).toBe(true);
    }
  });

  it('offers Rome 24/60/120 of melee foot and Carthage 24/48, with specialists fixed', () => {
    for (const id of ['hastati', 'principes', 'triarii']) {
      expect(squadTypeOf(squadTypeCode(id) ?? -1)?.sizes, id).toEqual([24, 60, 120]);
    }
    for (const id of ['libyan-spear', 'gaul', 'iberian-sword']) {
      expect(squadTypeOf(squadTypeCode(id) ?? -1)?.sizes, id).toEqual([24, 48]);
    }
    expect(squadTypeOf(squadTypeCode('balearic-slinger') ?? -1)?.sizes).toEqual([24]);
    expect(squadTypeOf(squadTypeCode('numidian-horse') ?? -1)?.sizes).toEqual([12]);
    expect(squadTypeOf(squadTypeCode('elephant') ?? -1)?.sizes).toEqual([24]);
  });

  it('accepts only a size the type really offers', () => {
    const hastati = squadTypeOf(squadTypeCode('hastati') ?? -1)!;
    const libyan = squadTypeOf(squadTypeCode('libyan-spear') ?? -1)!;

    for (const men of [24, 60, 120]) expect(isLegalSize(hastati, men), String(men)).toBe(true);
    for (const men of [12, 23, 25, 36, 48, 64, 121]) expect(isLegalSize(hastati, men), String(men)).toBe(false);
    expect(isLegalSize(libyan, 48)).toBe(true);
    expect(isLegalSize(libyan, 60)).toBe(false);
  });

  it('quotes the current price for 24 men, and proportional bills without a bulk discount', () => {
    const hastati = squadTypeOf(squadTypeCode('hastati') ?? -1)!;
    const triarii = squadTypeOf(squadTypeCode('triarii') ?? -1)!;
    const libyan = squadTypeOf(squadTypeCode('libyan-spear') ?? -1)!;
    const gaul = squadTypeOf(squadTypeCode('gaul') ?? -1)!;
    const horse = squadTypeOf(squadTypeCode('numidian-horse') ?? -1)!;

    expect(COST_BASIS).toBe(24);
    expect(recruitCost(hastati, 24)).toEqual({ grain: 8, timber: 0, stone: 0, iron: 2 });
    expect(recruitCost(hastati, 60)).toEqual({ grain: 20, timber: 0, stone: 0, iron: 5 });
    expect(recruitCost(hastati, 120)).toEqual({ grain: 40, timber: 0, stone: 0, iron: 10 });
    expect(recruitCost(triarii, 60)).toEqual({ grain: 25, timber: 0, stone: 0, iron: 15 });
    expect(recruitCost(libyan, 48)).toEqual({ grain: 12, timber: 0, stone: 0, iron: 4 });
    expect(recruitCost(gaul, 48)).toEqual({ grain: 10, timber: 0, stone: 0, iron: 2 });
    expect(recruitCost(horse, 12)).toEqual({ grain: 4, timber: 0, stone: 0, iron: 1 });

    // Five 24-man Squads cost exactly what one 120-man Squad does: no discount.
    expect(recruitCost(hastati, 24).grain * 5).toBe(recruitCost(hastati, 120).grain);
  });

  it('charges Payroll on the rate per 24 men, following surviving men and rounding up', () => {
    const hastati = squadTypeOf(squadTypeCode('hastati') ?? -1)!;
    const libyan = squadTypeOf(squadTypeCode('libyan-spear') ?? -1)!;
    const horse = squadTypeOf(squadTypeCode('numidian-horse') ?? -1)!;

    expect(PAYROLL_BASIS).toBe(24);
    expect(payrollBill(hastati, 24)).toBe(3);
    expect(payrollBill(hastati, 60)).toBe(8);
    expect(payrollBill(hastati, 120)).toBe(15);
    expect(payrollBill(libyan, 24)).toBe(3);
    expect(payrollBill(libyan, 48)).toBe(6);
    expect(payrollBill(horse, 12)).toBe(2);

    // A surviving remnant still owes its share; the bill falls with the men.
    expect(payrollBill(hastati, 17)).toBe(3);
    expect(payrollBill(hastati, 1)).toBe(1);

    // Splitting equal men cannot lower the total bill, which is the rule that
    // closes the free-fragmentation exploit: two 60s cost at least one 120.
    expect(payrollBill(hastati, 60) + payrollBill(hastati, 60)).toBeGreaterThanOrEqual(
      payrollBill(hastati, 120),
    );
    expect(payrollBill(hastati, 24) * 5).toBe(payrollBill(hastati, 120));
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
