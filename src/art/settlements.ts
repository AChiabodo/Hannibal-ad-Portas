/**
 * Settlements and fortifications, drawn: a settlement on the map, and what is left of
 * its walls (ticket U6).
 *
 * B1 puts four to six minor settlements and a Stronghold for each Faction on the
 * theatre, and until this ticket the main map showed *none* of them: a settlement
 * was a tile the rules knew about, drawn on the minimap as one coloured pixel. A
 * Player could not see a settlement, could not tell a Stronghold from a minor one, and
 * could not read a breach. This module is the drawing.
 *
 * ## What a settlement is, in this module's vocabulary
 *
 * A **settlement** is open or walled: a *minor settlement* is a cluster of huts with
 * nobody's wall round it, and a *Stronghold* is the same settlement inside a stone
 * enceinte of four wall sections and a gate (ADR-0018: the gate and four stretches of
 * wall, one to a side, each with its own hit points). Its **condition** is one of three
 * per structure — `intact`, `damaged`, `breached` — and its **memory** is whether
 * the Faction is looking at it now or remembers it. Its **owner** is a Faction, or
 * nobody; a remembered settlement has no owner, because memory records where it is
 * and not who holds it today (ADR-0020, and the same rule the minimap draws by).
 *
 * ## One wall section, four ways
 *
 * A Stronghold is a square enceinte, and the four sides are not four drawings:
 * the wall section is **one 40×7 buffer** — crenellations along its outer edge,
 * a wall walk, a face and a shadow — and `rotateQuarterTurns` is what puts it on
 * the four sides, exactly as B3's terrain turns one transition tile four ways.
 * Corner towers are one 8×8 buffer placed four times. The gate is one gatehouse
 * drawn on the south side, and the whole Stronghold is then **rotated** so that
 * the gate faces the side the rules say it faces: the settlement is drawn once, and a
 * gate on the west is the same drawing turned a quarter.
 *
 * ## Condition is painted into declared regions, not drawn three times
 *
 * A damaged wall is not a second wall: the middle of the section loses its
 * merlons, its walk drops into a notch and a crack runs down the face. A breach
 * is the same declaration with the middle cleared out and rubble left at its
 * foot. The three states therefore cannot drift apart — they are one wall with
 * one declared middle — and `tests/art/settlements.test.ts` measures them: a
 * breach has to leave a hole a man could read at one screen pixel per art pixel.
 *
 * ## Memory is a stone silhouette, and never a claim
 *
 * A remembered settlement is drawn **without an owner's cloth, without a gate and with
 * uniform walls**: the fog's memory holds that a walled settlement stood there, and
 * `sim/fog.ts`'s contacts do not hold which side its gate was on or how much of
 * the wall was left. So the remembered drawing is re-tinted into the stone ramp
 * (`ghost`) — no colours, no banner, no damage — and the theatre's own fog veil
 * darkens it on screen beside the ground it stands on. Nothing in this module can
 * invent a condition from memory, because a remembered look carries none.
 *
 * ## Where it sits
 *
 * `art/` is the pixel library and knows nothing of Factions, rules or fog: it is
 * handed a `SettlementLook` — art words only — and returns a `PixelBuffer`. The
 * mapping from an Observation to that look is `render/settlements.ts`'s, the
 * layer that puts the buffer on the stage is `render/settlement-layer.ts`'s, and
 * the sample that is judged on the Atelier's plate is `SITE_SPECIMENS`.
 */
import { DETAIL_RAMPS, RAMPS, shadeAt } from './palette.ts';
import {
  TRANSPARENT,
  createPixelBuffer,
  fillRect,
  pixelAt,
  rotateQuarterTurns,
  setPixel,
  type PixelBuffer,
  type Rgba,
} from './pixel-buffer.ts';

/** The two things a settlement on the map can be: an open one, or a walled Stronghold. */
export const SETTLEMENT_KINDS = ['settlement', 'stronghold'] as const;

/** One of them. */
export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];

/**
 * The side of a settlement's art, in pixels.
 *
 * A minor settlement spans three tiles and a Stronghold four and a half, which is the
 * same order of size as a Squad's block of men (three tiles tall): a Stronghold has
 * to be the largest thing on the map that is not the map, and a minor settlement
 * has to be smaller than it and larger than a resource marker's one tile.
 */
export const SITE_SIZE: Readonly<Record<SettlementKind, number>> = { settlement: 48, stronghold: 72 };

/** Whether the Faction looks at a settlement now, or remembers it. */
export const SITE_MEMORIES = ['seen', 'remembered'] as const;

/** One of them. */
export type SiteMemory = (typeof SITE_MEMORIES)[number];

/** The compass a fortification is built on: four wall sections, and the side the gate is on. */
export const SITE_SIDES = ['north', 'east', 'south', 'west'] as const;

/** One of them. */
export type SiteSide = (typeof SITE_SIDES)[number];

/** What is left of one structure: whole, hurt, or broken open. */
export const SITE_CONDITIONS = ['intact', 'damaged', 'breached'] as const;

/** One of them. */
export type SiteCondition = (typeof SITE_CONDITIONS)[number];

/** Who holds a settlement, as the cloth on its banner. `none` is nobody — or nobody known. */
export const SITE_OWNERS = ['rome', 'carthage', 'none'] as const;

/** One of them. */
export type SiteOwner = (typeof SITE_OWNERS)[number];

/** What stands at the gate: nothing, a ram being built, or a ram battering it. */
export const SITE_RAMS = ['none', 'building', 'built'] as const;

/** One of them. */
export type SiteRam = (typeof SITE_RAMS)[number];

/**
 * Everything this module draws from: a settlement, its owner, what the Faction knows of
 * it, and what is left of its walls.
 *
 * Art words only. Whether an owner is "the Faction looking" or "the enemy" is the
 * renderer's business, because which Faction that is depends on who is playing.
 */
export interface SettlementLook {
  /** A completed Castrum known through the permitted Observation. */
  readonly camp?: boolean;
  /** Open settlement, or walled Stronghold. */
  readonly kind: SettlementKind;

  /** Whose cloth flies over it, or `none` for a settlement nobody is known to hold. */
  readonly owner: SiteOwner;

  /** Whether the drawing is of what is seen now, or of what was seen once. */
  readonly memory: SiteMemory;

  /** Which side the gate is on, for a walled Stronghold: the drawing is turned to face it. */
  readonly gateSide: SiteSide;

  /** What is left of the gate, or `null` where there is none, or where memory holds none. */
  readonly gate: SiteCondition | null;

  /** What is left of each wall section, by side: what a walled settlement has. */
  readonly walls: Readonly<Record<SiteSide, SiteCondition>>;

  /** The ram at the gate: only a siege this Faction can see has one. */
  readonly ram: SiteRam;
}

/** The inks of the art, in the palette's own ramps and nothing else. */
const INK = {
  /** The line every structure is drawn against, so it reads on any ground. */
  outline: shadeAt(RAMPS.stone, 0),
  /** The lit top of a wall or a tower, and its sunward edge. */
  wallLit: shadeAt(RAMPS.stone, 6),
  /** The face a wall shows the light. */
  wallBody: shadeAt(RAMPS.stone, 5),
  /** The course below the face, in shadow. */
  wallMid: shadeAt(RAMPS.stone, 4),
  /** The shadow a wall casts on the ground inside it. */
  wallShadow: shadeAt(RAMPS.stone, 2),
  /** Rubble, cracks and the dark of an opening. */
  rub: shadeAt(RAMPS.stone, 1),
  /** The courtyard's packed earth: dark, so a wall and a roof read against it. */
  earth: shadeAt(RAMPS.bronze, 1),
  /** Paving, and the ground a minor settlement's well stands on. */
  paving: shadeAt(RAMPS.stone, 3),
  /** A roof's lit ridge. */
  roofLit: shadeAt(RAMPS.bronze, 5),
  /** A roof's two slopes. */
  roofBody: shadeAt(RAMPS.bronze, 4),
  /** The eaves, and the shadow under them. */
  roofShadow: shadeAt(RAMPS.bronze, 2),
  /** A door, a post, a beam: timber. */
  timber: shadeAt(RAMPS.bronze, 3),
  /** Timber in shadow. */
  timberDark: shadeAt(RAMPS.bronze, 1),
  /** The wall of a hut, and the plaster of a keep's face. */
  plaster: shadeAt(RAMPS.parchment, 4),
  /** A well's water. */
  water: shadeAt(RAMPS.water, 4),
} as const;

/** The cloth each Faction flies, and the shade its folds take. */
const CLOTH: Readonly<Record<Exclude<SiteOwner, 'none'>, { readonly cloth: Rgba; readonly fold: Rgba }>> = {
  // The same two colours the minimap draws a settlement's holder in: Rome's bright
  // bronze, Carthage's blood. One palette, so the corner of the screen and the map
  // under the camera cannot name a holder in two different colours.
  rome: { cloth: shadeAt(RAMPS.bronze, 6), fold: shadeAt(RAMPS.bronze, 4) },
  carthage: { cloth: shadeAt(RAMPS.blood, 6), fold: shadeAt(RAMPS.blood, 4) },
};

/**
 * The four sides of the enceinte: how far its section is turned, and where it starts.
 *
 * A section is forty long and seven thick with its merlons along the outer edge, so
 * a turned section's long side lies along its wall and its thick side reaches
 * inwards — the ring is what the four placements add up to.
 */
const ENCEINTE: readonly {
  readonly side: SiteSide;
  readonly turns: number;
  readonly x: number;
  readonly y: number;
}[] = [
  { side: 'north', turns: 0, x: 8, y: 3 },
  { side: 'east', turns: 1, x: SITE_SIZE.stronghold - 10, y: 8 },
  { side: 'south', turns: 2, x: 8, y: SITE_SIZE.stronghold - 11 },
  { side: 'west', turns: 3, x: 3, y: 8 },
];

/** How long one wall section is, in pixels: the distance between two corner towers. */
const WALL_LENGTH = SITE_SIZE.stronghold - 16;

/** How thick the wall is, merlons aside: the walk, the face and the shadow. */
const WALL_THICKNESS = 6;

/**
 * Where a wall breaks, in the section's own coordinates: two spans, one either side
 * of its middle.
 *
 * Two spans and not one, because the middle of a wall is where its **gatehouse**
 * stands: a single gap there would be drawn behind the gate and a Player would be
 * told about a breach they cannot see. A broken wall is therefore broken on both
 * sides of the gate — which is also what a wall under the ram looks like.
 */
const DAMAGE_SPANS: readonly { readonly first: number; readonly last: number }[] = [
  { first: 3, last: 11 },
  { first: WALL_LENGTH - 12, last: WALL_LENGTH - 4 },
];

/** Where the south wall's gatehouse stands: on the wall, one row taller than it. */
const GATE_TOP = SITE_SIZE.stronghold - 12;

/** The side of a corner tower, in pixels. */
const TOWER_SIZE = 8;

/** Where the four corner towers stand: one at each corner of the ring. */
const TOWERS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 2, y: 2 },
  { x: SITE_SIZE.stronghold - TOWER_SIZE - 2, y: 2 },
  { x: 2, y: SITE_SIZE.stronghold - TOWER_SIZE - 2 },
  { x: SITE_SIZE.stronghold - TOWER_SIZE - 2, y: SITE_SIZE.stronghold - TOWER_SIZE - 2 },
];

/** The gatehouse: fourteen pixels wide, centred on the south wall. */
const GATEHOUSE = { left: Math.floor(SITE_SIZE.stronghold / 2) - 7, width: 14 } as const;

/** Where the gate's passage runs, inside the gatehouse. */
const GATE_PASSAGE = { x: Math.floor(SITE_SIZE.stronghold / 2) - 3, width: 6 } as const;

/** The ram's shed, drawn against the gate it is battering: narrow enough to leave the gate towers in sight. */
const RAM_SHED = { x: Math.floor(SITE_SIZE.stronghold / 2) - 4, y: SITE_SIZE.stronghold - 11, width: 8, height: 11 } as const;

/** The huts of a minor settlement: a scatter round a well, inside its three tiles. */
const VILLAGE_HUTS: readonly Hut[] = [
  { x: 4, y: 5, width: 14, height: 12 },
  { x: 29, y: 6, width: 14, height: 12 },
  { x: 5, y: 30, width: 14, height: 12 },
  { x: 29, y: 30, width: 14, height: 12 },
];

/** The houses sheltering inside a Stronghold's walls: four round a keep. */
const TOWN_HOUSES: readonly Hut[] = [
  { x: 12, y: 12, width: 12, height: 11 },
  { x: 49, y: 13, width: 12, height: 11 },
  { x: 13, y: 48, width: 12, height: 11 },
  { x: 48, y: 48, width: 13, height: 11 },
];

/** A keep: the largest roof inside the walls, which is what marks a Stronghold from afar. */
const KEEP = { x: 27, y: 25, width: 18, height: 20 } as const;

/** One roofed building, in the art's own coordinates. */
interface Hut {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The sprites already composed, keyed by the look that produced them.
 *
 * A look has a small number of states in practice — an owner, three wall
 * conditions, a gate and a ram — and the map asks for the same few every frame, so
 * the memo is a cache of a pure function and is never a source of truth.
 */
const SPRITES = new Map<string, PixelBuffer>();

/**
 * The name of a look, in the catalogue's idiom: stable, machine-readable, and the
 * key two sprites are compared on.
 */
export function siteLookKey(look: SettlementLook): string {
  return [
    look.kind,
    look.owner,
    look.memory,
    look.gateSide,
    look.gate ?? 'none',
    ...SITE_SIDES.map((side) => look.walls[side]),
    look.ram,
    look.camp === true ? 'camp' : 'civil',
  ].join(':');
}

/**
 * One settlement, drawn.
 *
 * A minor settlement is the huts; a Stronghold is the same settlement inside its
 * enceinte, turned so that its gate faces `gateSide`. A `remembered` settlement is
 * re-tinted into the stone ramp after it is drawn, which is why memory can carry no
 * condition: the look a remembered settlement is drawn from has none.
 */
export function siteSprite(look: SettlementLook): PixelBuffer {
  const drawn = look.memory === 'remembered' ? rememberedLook(look) : look;
  const key = siteLookKey(drawn);

  const cached = SPRITES.get(key);
  if (cached !== undefined) return cached;

  const composed = drawn.kind === 'settlement'
    ? minorSettlementSprite(drawn)
    : strongholdSprite(drawn);
  const sprite = drawn.memory === 'remembered' ? ghost(composed) : composed;

  SPRITES.set(key, sprite);
  return sprite;
}

/**
 * The look a remembered settlement is drawn from: the settlement, and no claim about it.
 *
 * A memory of a settlement holds that it is there and whether it was walled; it does not
 * hold a holder, which side the gate was on, or how much of the wall stood. So the
 * remembered look drops all four, and `ghost` takes the colour out of what is left.
 */
function rememberedLook(look: SettlementLook): SettlementLook {
  return {
    kind: look.kind,
    owner: 'none',
    camp: false,
    memory: 'remembered',
    gateSide: 'south',
    gate: null,
    walls: intactWalls(),
    ram: 'none',
  };
}

/** Four walls, whole: what a walled settlement is drawn with when nothing is known against it. */
function intactWalls(): Readonly<Record<SiteSide, SiteCondition>> {
  return { north: 'intact', east: 'intact', south: 'intact', west: 'intact' };
}

/** A minor settlement: the same cluster of roofs, with nobody's wall round it. */
function minorSettlementSprite(look: SettlementLook): PixelBuffer {
  const size = SITE_SIZE.settlement;
  const sprite = createPixelBuffer(size, size);

  // The ground the settlement stands on: a little paving at its middle, so a cluster
  // of roofs reads as a settlement rather than as four roofs that happen to be near one
  // another. It is drawn first and everything else stands on it.
  fillRect(sprite, 18, 18, 12, 12, INK.paving);
  paintWell(sprite, 22, 22);
  fillRect(sprite, 21, 8, 2, 33, INK.paving);

  for (const hut of VILLAGE_HUTS) paintHut(sprite, hut);
  if (look.camp === true) paintCamp(sprite, 26, 30);

  // The banner stands at the north of the settlement, between the two front huts,
  // where nothing hides it.
  paintBanner(sprite, 23, 1, look.owner);
  outline(sprite);

  return sprite;
}

/** A walled Stronghold: the settlement, its enceinte and its gate, turned to face the gate. */
function strongholdSprite(look: SettlementLook): PixelBuffer {
  const size = SITE_SIZE.stronghold;
  const sprite = createPixelBuffer(size, size);

  // The courtyard, then what stands inside it, then the walls over both: the wall
  // is the nearest thing to the eye at every side, and what is behind it is
  // hidden by it.
  fillRect(sprite, 10, 10, SITE_SIZE.stronghold - 20, SITE_SIZE.stronghold - 20, INK.earth);
  paintWell(sprite, 34, 51);
  for (const house of TOWN_HOUSES) paintHut(sprite, house);
  paintKeep(sprite, look.owner);
  if (look.camp === true) paintCamp(sprite, 44, 46);

  paintEnceinte(sprite, look);
  if (look.gate !== null) paintGatehouse(sprite, look.gate);
  if (look.ram !== 'none') paintRam(sprite, look.ram);

  outline(sprite);

  // The gate the rules give a Stronghold faces the other Faction, which is a side
  // of the compass: the Stronghold is drawn with its gate south and turned to meet it,
  // so one drawing serves all four and the four cannot disagree about the wall.
  return rotateQuarterTurns(sprite, turnsFor(look.gateSide));
}

/** How far the southern gate has to be turned to face a side: a clockwise quarter each. */
function turnsFor(side: SiteSide): number {
  const reach = SITE_SIDES.indexOf(side) - SITE_SIDES.indexOf('south');

  return (reach + SITE_SIDES.length) % SITE_SIDES.length;
}

/** The four walls of the enceinte, each drawn once and turned to its side. */
function paintEnceinte(sprite: PixelBuffer, look: SettlementLook): void {
  for (const { side, turns, x, y } of ENCEINTE) {
    blitBuffer(sprite, rotateQuarterTurns(wallSection(look.walls[side]), turns), x, y);
  }

  for (const tower of TOWERS) blitBuffer(sprite, towerSprite(), tower.x, tower.y);
}

/**
 * One wall section: crenellations along its outer edge, a walk, a face and a shadow.
 *
 * The three conditions are the same drawing with the **declared damage spans**
 * treated three ways — the merlons knocked off, the walk dropped into a notch, and
 * either a crack or an opening — so nothing about a hurt wall is drawn twice and
 * the three states cannot drift apart into three opinions about where a wall breaks.
 */
function wallSection(condition: SiteCondition): PixelBuffer {
  const section = createPixelBuffer(WALL_LENGTH, WALL_THICKNESS + 1);

  // The merlons: two pixels of wall, two of sky, along the outer edge.
  for (let x = 0; x < WALL_LENGTH; x += 1) {
    if (Math.floor(x / 2) % 2 === 0) setPixel(section, x, 0, INK.wallLit);
  }

  fillRect(section, 0, 1, WALL_LENGTH, 2, INK.wallLit);
  fillRect(section, 0, 3, WALL_LENGTH, 2, INK.wallBody);
  fillRect(section, 0, 5, WALL_LENGTH, 1, INK.wallMid);
  fillRect(section, 0, 6, WALL_LENGTH, 1, INK.wallShadow);

  // Two courses of masonry across the face, which is what makes a wall read as
  // built rather than as a stripe of stone.
  for (let x = 2; x < WALL_LENGTH - 1; x += 5) {
    setPixel(section, x, 4, INK.wallMid);
    setPixel(section, x + 2, 3, INK.wallMid);
  }

  for (const span of DAMAGE_SPANS) {
    const width = span.last - span.first + 1;

    if (condition === 'damaged') {
      // The merlons are knocked off, the walk has dropped into a notch, cracks run
      // down the face and rubble lies at its foot: a wall that has been under the
      // ram, and is still a wall.
      for (let x = span.first; x <= span.last; x += 1) setPixel(section, x, 0, TRANSPARENT);
      fillRect(section, span.first, 1, width, 2, INK.wallMid);
      fillRect(section, span.first + 1, 1, width - 2, 1, INK.wallShadow);
      fillRect(section, span.first + 1, 3, 1, 2, INK.rub);
      fillRect(section, span.first + 4, 3, 1, 3, INK.rub);
      fillRect(section, span.first + 6, 4, 1, 2, INK.rub);
      fillRect(section, span.first + 3, 6, 4, 1, INK.rub);
    }

    if (condition === 'breached') {
      // An opening: the wall is gone from the walk to the shadow, and what is left
      // of it lies at the foot of the gap.
      fillRect(section, span.first, 0, width, WALL_THICKNESS + 1, TRANSPARENT);
      for (let x = span.first; x <= span.last; x += 1) {
        const depth = (x * 7) % 3;
        setPixel(section, x, 6, INK.rub);
        if (depth > 0) setPixel(section, x, 5, INK.wallShadow);
        if (depth === 2) setPixel(section, x, 4, INK.paving);
      }
      // The wall's own edge either side of the gap is darker where it broke, so the
      // opening reads as a hole in something rather than as a wall never drawn.
      fillRect(section, span.first - 1, 1, 1, 5, INK.wallMid);
      fillRect(section, span.last + 1, 1, 1, 5, INK.wallMid);
    }
  }

  return section;
}

/** One corner tower: a square of stone, lit from the north-west and shadowed to the south-east. */
function towerSprite(): PixelBuffer {
  const tower = createPixelBuffer(TOWER_SIZE, TOWER_SIZE);

  fillRect(tower, 0, 0, TOWER_SIZE, TOWER_SIZE, INK.wallBody);
  fillRect(tower, 1, 1, TOWER_SIZE - 2, 2, INK.wallLit);
  fillRect(tower, 1, 1, 2, TOWER_SIZE - 2, INK.wallLit);
  fillRect(tower, 1, TOWER_SIZE - 2, TOWER_SIZE - 2, 1, INK.wallMid);
  fillRect(tower, TOWER_SIZE - 2, 1, 1, TOWER_SIZE - 2, INK.wallMid);
  // A merlon at each corner of the tower's top, which is what makes it a tower and
  // not a block of stone: two pixels, and the silhouette changes.
  setPixel(tower, 1, 0, INK.wallLit);
  setPixel(tower, TOWER_SIZE - 2, 0, INK.wallLit);

  return tower;
}

/** The gatehouse on the south wall, and the passage through it in whatever state the gate is. */
function paintGatehouse(sprite: PixelBuffer, condition: SiteCondition): void {
  const top = GATE_TOP;
  const left = GATEHOUSE.left;

  // Two gate towers, taller than the wall by a row so the gate can be found at a
  // glance from any direction the Stronghold is turned.
  for (const x of [left, left + GATEHOUSE.width - 4]) {
    fillRect(sprite, x, top - 1, 4, WALL_THICKNESS + 2, INK.wallBody);
    fillRect(sprite, x, top - 1, 4, 1, INK.wallLit);
    fillRect(sprite, x + 3, top, 1, WALL_THICKNESS + 1, INK.wallMid);
  }

  const passage = { x: GATE_PASSAGE.x, y: top + 1, width: GATE_PASSAGE.width, height: WALL_THICKNESS };
  fillRect(sprite, passage.x, top, passage.width, 1, INK.wallLit);

  if (condition === 'intact') {
    // Timber doors, shut, with an iron band down the join.
    fillRect(sprite, passage.x, passage.y, passage.width, passage.height, INK.timber);
    fillRect(sprite, passage.x + Math.floor(passage.width / 2), passage.y, 1, passage.height, INK.timberDark);
    fillRect(sprite, passage.x, passage.y, passage.width, 1, INK.roofShadow);
  } else if (condition === 'damaged') {
    // One leaf of the gate is down and splintered: the passage is dark at one side,
    // and the door that is left hangs across the other.
    fillRect(sprite, passage.x, passage.y, passage.width, passage.height, INK.rub);
    fillRect(sprite, passage.x, passage.y, 3, passage.height, INK.timber);
    fillRect(sprite, passage.x + 2, passage.y, 1, passage.height, INK.timberDark);
    setPixel(sprite, passage.x + 1, passage.y + 2, INK.roofShadow);
    setPixel(sprite, passage.x + 4, passage.y + 4, INK.roofShadow);
  } else {
    // Broken open: the passage is a dark hole with rubble in it, and no door.
    fillRect(sprite, passage.x, passage.y, passage.width, passage.height, INK.rub);
    for (let x = passage.x; x < passage.x + passage.width; x += 1) {
      if ((x * 5) % 3 !== 0) setPixel(sprite, x, passage.y + passage.height - 1, INK.wallShadow);
    }
  }
}

/** The ram at the gate: a shed on wheels, and the beam it drives. */
function paintRam(sprite: PixelBuffer, ram: SiteRam): void {
  const { x, y, width, height } = RAM_SHED;

  if (ram === 'building') {
    // The frame, and no roof: four posts and the beam lying beside them.
    for (const post of [x + 1, x + width - 2]) fillRect(sprite, post, y + 2, 1, height - 3, INK.timberDark);
    fillRect(sprite, x + 1, y + 2, width - 2, 1, INK.timber);
    fillRect(sprite, x + 1, y + height - 2, width - 2, 1, INK.timberDark);

    return;
  }

  // Built: a pitched shed on the frame, and the beam reaching out of its mouth.
  fillRect(sprite, x, y + 1, width, height - 2, INK.roofShadow);
  fillRect(sprite, x + 1, y + 1, width - 2, 3, INK.roofBody);
  fillRect(sprite, x + 1, y + 1, width - 2, 1, INK.roofLit);
  // The beam, and the iron head of it, at the doors.
  fillRect(sprite, x + 2, y + 4, width - 4, 2, INK.timber);
  fillRect(sprite, x + 2, y + 5, width - 4, 1, INK.timberDark);
  fillRect(sprite, x + 3, y + 6, width - 6, 1, INK.rub);
  // Two wheels, which is what makes a shed a ram.
  fillRect(sprite, x + 1, y + height - 2, 2, 1, INK.timberDark);
  fillRect(sprite, x + width - 3, y + height - 2, 2, 1, INK.timberDark);
}

/** A hut: a roof of two slopes with a lit ridge, its eaves in shadow, and a plastered wall below. */
function paintHut(sprite: PixelBuffer, hut: Hut): void {
  const { x, y, width, height } = hut;
  const wall = 2;
  const roof = height - wall;

  fillRect(sprite, x + 1, y + height - 1, width, 1, INK.roofShadow);
  fillRect(sprite, x, y, width, roof, INK.roofBody);
  fillRect(sprite, x + Math.floor(width / 2) - 1, y, 2, roof, INK.roofLit);
  // Tiled roof seams and a shaded eave, in the existing bronze ramp.
  for (let tile = 2; tile < width - 1; tile += 3) setPixel(sprite, x + tile, y + 1, INK.roofShadow);
  fillRect(sprite, x, y + roof - 1, width, 1, INK.roofShadow);
  fillRect(sprite, x + 1, y + roof, width - 2, wall, INK.plaster);
  setPixel(sprite, x + Math.floor(width / 2), y + roof, INK.timberDark);
}

/** A keep: the stone tower inside the walls, with the Faction's cloth above it. */
function paintKeep(sprite: PixelBuffer, owner: SiteOwner): void {
  const { x, y, width, height } = KEEP;

  fillRect(sprite, x, y, width, height, INK.wallBody);
  fillRect(sprite, x, y, width, 2, INK.wallLit);
  fillRect(sprite, x, y, 2, height, INK.wallLit);
  fillRect(sprite, x + width - 2, y, 2, height, INK.wallMid);
  fillRect(sprite, x, y + height - 2, width, 2, INK.wallMid);
  for (let row = 3; row < height - 2; row += 3) {
    setPixel(sprite, x + 3 + row % 2, y + row, INK.wallShadow);
    setPixel(sprite, x + width - 4, y + row, INK.wallLit);
  }
  // A course of masonry and a door, so the keep reads as built at one-to-one zoom.
  fillRect(sprite, x + 3, y + 5, width - 6, 1, INK.wallMid);
  fillRect(sprite, x + Math.floor(width / 2) - 1, y + height - 5, 3, 3, INK.timberDark);

  paintBanner(sprite, x - 4, y - 5, owner);
}

/** A well: a stone rim round a dark disc of water. */
function paintWell(sprite: PixelBuffer, x: number, y: number): void {
  fillRect(sprite, x, y, 4, 4, INK.wallMid);
  fillRect(sprite, x + 1, y + 1, 2, 2, INK.water);
  setPixel(sprite, x, y, INK.wallLit);
}

/** A banner on a pole: the one thing on a settlement that says who holds it. */
function paintBanner(sprite: PixelBuffer, x: number, y: number, owner: SiteOwner): void {
  if (owner === 'none') return;

  const { cloth, fold } = CLOTH[owner];

  fillRect(sprite, x, y, 1, 8, INK.timber);
  fillRect(sprite, x + 1, y, 5, 4, cloth);
  fillRect(sprite, x + 1, y + 3, 5, 1, fold);
  setPixel(sprite, x + 5, y + 1, fold);
}

/**
 * A settlement as it is remembered: the same silhouette, in stone.
 *
 * Memory is not a dimmed photograph. What a Faction remembers of a settlement is *that
 * it is there*: a Stronghold is a walled settlement, a minor settlement is a cluster
 * of roofs, and
 * neither is remembered in the enemy's colours, with a gate on a side, or with a
 * breach in its wall (ADR-0020, `sim/fog.ts`'s contacts). So the drawing is taken
 * apart into brightness and put back together out of the stone ramp — a grey
 * silhouette — and the theatre's own veil over remembered ground darkens it on
 * screen beside the ground it stands on.
 */
function ghost(sprite: PixelBuffer): PixelBuffer {
  const ghosted = createPixelBuffer(sprite.width, sprite.height);
  const shades = DETAIL_RAMPS.stone.length - 1;

  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      const [red, green, blue, alpha] = pixelAt(sprite, x, y);
      if (alpha === 0) continue;

      // Integer luminance, then the nearest shade of the stone ramp: the silhouette
      // survives and every colour the settlement used to have does not.
      const luminance = Math.floor((red * 3 + green * 6 + blue) / 10);
      const shade = Math.min(shades, Math.floor((luminance * shades) / 255));

      setPixel(ghosted, x, y, shadeAt(DETAIL_RAMPS.stone, shade));
    }
  }

  return ghosted;
}

/** Draws a one-pixel line round everything a buffer painted, so a settlement reads on any ground. */
function outline(sprite: PixelBuffer): void {
  const painted: boolean[] = [];
  for (let index = 3; index < sprite.pixels.length; index += 4) painted.push((sprite.pixels[index] ?? 0) > 0);

  const size = sprite.width;
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (painted[y * size + x] === true) continue;

      const touched = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => {
        if (nx === undefined || ny === undefined) return false;
        if (nx < 0 || ny < 0 || nx >= size || ny >= sprite.height) return false;

        return painted[ny * size + nx] === true;
      });

      if (touched) setPixel(sprite, x, y, INK.outline);
    }
  }
}

/** Copies a source buffer into a larger one at a point, clipped to the target. */
function blitBuffer(target: PixelBuffer, source: PixelBuffer, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy += 1) {
    for (let sx = 0; sx < source.width; sx += 1) {
      const colour = pixelAt(source, sx, sy);
      if (colour[3] === 0) continue;

      setPixel(target, x + sx, y + sy, colour);
    }
  }
}

/** One row of the catalogue's settlements section: a named settlement, and the look it is drawn from. */
export interface SiteSpecimen {
  /** A stable name, e.g. `site:stronghold:rome:breached`. */
  readonly name: string;
  /** The look the specimen is drawn from. */
  readonly look: SettlementLook;
}

/** An open settlement, held by a Faction or by nobody, seen now. */
function openSettlement(owner: SiteOwner): SettlementLook {
  return {
    kind: 'settlement',
    owner,
    memory: 'seen',
    gateSide: 'south',
    gate: null,
    walls: intactWalls(),
    ram: 'none',
  };
}

/** A walled Stronghold in a given state, seen now. */
function walledSettlement(
  owner: SiteOwner,
  walls: Readonly<Record<SiteSide, SiteCondition>>,
  gate: SiteCondition,
  ram: SiteRam = 'none',
  gateSide: SiteSide = 'south',
): SettlementLook {
  return { kind: 'stronghold', owner, memory: 'seen', gateSide, gate, walls, ram };
}

/**
 * The plate's specimens: both Factions, an open settlement and a walled one, walls whole,
 * hurt and broken, the ram at the gate, and a settlement remembered.
 *
 * A handful and not the cross-product: what the Atelier has to answer is whether a
 * Player can tell a minor settlement from a Stronghold, a whole wall from a broken one, and
 * a settlement in view from one remembered, and one specimen per question is what
 * makes that judgeable. The four sides are exercised by the generator's own tests
 * rather than by four more rows.
 */
export const SITE_SPECIMENS: readonly SiteSpecimen[] = [
  { name: 'site:settlement:rome:seen', look: openSettlement('rome') },
  { name: 'site:settlement:rome:castrum', look: { ...openSettlement('rome'), camp: true } },
  { name: 'site:settlement:carthage:seen', look: openSettlement('carthage') },
  { name: 'site:settlement:none:seen', look: openSettlement('none') },
  {
    name: 'site:stronghold:rome:intact',
    look: walledSettlement('rome', intactWalls(), 'intact'),
  },
  {
    name: 'site:stronghold:carthage:intact',
    look: walledSettlement('carthage', intactWalls(), 'intact', 'none', 'north'),
  },
  {
    name: 'site:stronghold:rome:damaged',
    look: walledSettlement('rome', { north: 'damaged', east: 'intact', south: 'intact', west: 'intact' }, 'damaged'),
  },
  {
    name: 'site:stronghold:rome:breached',
    look: walledSettlement('rome', { north: 'breached', east: 'intact', south: 'intact', west: 'damaged' }, 'breached'),
  },
  {
    name: 'site:stronghold:rome:ram',
    look: walledSettlement('rome', { north: 'damaged', east: 'intact', south: 'intact', west: 'intact' }, 'damaged', 'built'),
  },
  {
    name: 'site:stronghold:carthage:remembered',
    look: { ...walledSettlement('carthage', intactWalls(), 'intact'), memory: 'remembered' },
  },
  {
    name: 'site:settlement:rome:remembered',
    look: { ...openSettlement('rome'), memory: 'remembered' },
  },
];

/** The specimens, named for the catalogue: the look's own key after the specimen's name. */
export function settlementEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return SITE_SPECIMENS.map((specimen) => ({ name: specimen.name, buffer: siteSprite(specimen.look) }));
}

/**
 * A mark drawn over a settlement the Player has selected.
 *
 * Generated art like everything else — a bracket in the four corners of the
 * sprite, in parchment, at the same size as the settlement so the layer only has to
 * blit it over one — because a selection a Player cannot see is a selection they
 * have to guess at, and `render/` may not draw a second way.
 */
export function siteMark(kind: SettlementKind): PixelBuffer {
  const cached = MARKS.get(kind);
  if (cached !== undefined) return cached;

  const size = SITE_SIZE[kind];
  const mark = createPixelBuffer(size, size);
  const arm = 5;

  for (const [x, y, dx, dy] of [
    [0, 0, 1, 1],
    [size - 1, 0, -1, 1],
    [0, size - 1, 1, -1],
    [size - 1, size - 1, -1, -1],
  ] as const) {
    for (let step = 0; step < arm; step += 1) {
      setPixel(mark, x + dx * step, y, MARK);
      setPixel(mark, x, y + dy * step, MARK);
    }
  }

  MARKS.set(kind, mark);
  return mark;
}

/** The ink a selection bracket is drawn in: the same parchment the minimap's camera box is. */
const MARK = shadeAt(RAMPS.parchment, 6);

/** The selection brackets already drawn, one per kind. */
const MARKS = new Map<SettlementKind, PixelBuffer>();

/** A palisade and two rows of pitched tents. Fits within the site's pick bounds. */
function paintCamp(sprite: PixelBuffer, x: number, y: number): void {
  fillRect(sprite, x, y, 20, 13, INK.earth);
  for (let post = 0; post < 20; post += 2) {
    fillRect(sprite, x + post, y, 1, 3, INK.timber);
    fillRect(sprite, x + post, y + 11, 1, 2, INK.timberDark);
  }
  for (const down of [3, 7]) for (const across of [2, 11]) {
    fillRect(sprite, x + across, y + down, 6, 3, INK.plaster);
    fillRect(sprite, x + across + 2, y + down, 2, 3, INK.roofLit);
    setPixel(sprite, x + across + 3, y + down + 2, INK.timberDark);
  }
}
