/** Shared tile geometry for physical settlements and their procedural drawing (#74). */
export interface GroundPoint { readonly x: number; readonly y: number }
export interface GroundRect extends GroundPoint { readonly width: number; readonly height: number }
export type SettlementKind = 'stronghold' | 'settlement';
export interface BuildingLot extends GroundRect {
  readonly building: string;
  readonly ordinal: number;
  readonly exterior: boolean;
}
export interface SettlementLayout {
  readonly grounds: GroundRect;
  readonly core: GroundRect;
  readonly capture: GroundRect;
  readonly muster: GroundRect;
  readonly assembly: GroundPoint;
  readonly gate: GroundRect;
  readonly lots: readonly BuildingLot[];
}

export function containsTile(rect: GroundRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

export function intersects(a: GroundRect, b: GroundRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

const interior: readonly BuildingLot[] = [
  ...[-6, -3, 0, 3].map((x, ordinal) => ({ building: 'house', ordinal, exterior: false, x, y: -6, width: 2, height: 2 })),
  ...[-3, 0].map((y, ordinal) => ({ building: 'granary', ordinal, exterior: false, x: -6, y, width: 2, height: 3 })),
  ...[-3, 0].map((y, ordinal) => ({ building: 'market', ordinal, exterior: false, x: 5, y, width: 2, height: 3 })),
  { building: 'villa', ordinal: 0, exterior: false, x: -6, y: 4, width: 3, height: 3 },
  { building: 'forum', ordinal: 0, exterior: false, x: 3, y: 4, width: 4, height: 3 },
];
const exteriorPositions: readonly GroundPoint[] = [
  ...[-11, -6, -1, 4, 9].map((x) => ({ x, y: -11 })),
  ...[-6, -1, 4, 9].map((y) => ({ x: -11, y })),
  ...[-6, -1, 4, 9].map((y) => ({ x: 9, y })),
  { x: -6, y: 9 }, { x: 4, y: 9 },
];
const exteriorKinds = ['farm', 'farm', 'farm', 'farm', 'lumber-camp', 'lumber-camp',
  'lumber-camp', 'lumber-camp', 'quarry', 'quarry', 'quarry', 'mine', 'mine', 'mine', 'castrum'];
const exterior = exteriorPositions.map((at, index): BuildingLot => ({
  ...at, width: 3, height: 3, exterior: true,
  building: exteriorKinds[index] ?? 'castrum',
  ordinal: exteriorKinds.slice(0, index).filter((kind) => kind === exteriorKinds[index]).length,
}));
const PLAN: SettlementLayout = {
  grounds: { x: -12, y: -12, width: 25, height: 25 },
  core: { x: -7, y: -7, width: 15, height: 15 },
  capture: { x: -1, y: -1, width: 3, height: 3 },
  muster: { x: -3, y: 2, width: 6, height: 4 },
  assembly: { x: 0, y: 6 },
  gate: { x: -1, y: 7, width: 3, height: 1 },
  lots: [...interior, ...exterior],
};

/** Positions are permanent across Tier, ownership and construction order. */
const PLANS: Readonly<Record<SettlementKind, SettlementLayout>> = { stronghold: PLAN, settlement: PLAN };
export function settlementLayout(kind: SettlementKind): SettlementLayout { return PLANS[kind]; }

/** Select one of the permanently reserved copies of a building kind. */
export function buildingLot(building: string, ordinal: number): BuildingLot | undefined {
  return PLAN.lots.find((lot) => lot.building === building && lot.ordinal === ordinal);
}

/** Turn south-authored ground coordinates to the settlement's actual gate side. */
export function turnPoint(at: GroundPoint, side: number): GroundPoint {
  switch (side) {
    case 0: return { x: -at.x, y: -at.y };
    case 1: return { x: at.y, y: -at.x };
    case 3: return { x: -at.y, y: at.x };
    default: return { x: at.x, y: at.y };
  }
}

export function turnRect(rect: GroundRect, side: number): GroundRect {
  const corners = [turnPoint(rect, side), turnPoint({ x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 }, side)];
  const a = corners[0] ?? rect;
  const b = corners[1] ?? rect;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
}
