/**
 * The fog of war: what a Faction has seen, what it remembers, and what it is
 * looking at now (PLAN §4, ticket B4).
 *
 * Partial observability is not a rendering effect here. It is the reason the
 * Observation contract is a fact rather than a promise (ADR-0003): a Controller
 * can only know what its Faction's fog holds, and the fog holds only what the
 * Faction's own eyes have covered. The renderer draws the same fog, so what a
 * player sees and what their Controller may decide on cannot drift apart.
 *
 * ## Three states, and memory
 *
 * A tile is in exactly one of three states, and the state is one question asked
 * of one grid:
 *
 * - **unexplored** — no eye has ever covered it. Its terrain was never written
 *   down, so the fog holds nothing about it, and a projection built from the fog
 *   carries nothing about it either.
 * - **remembered** — an eye covered it once. The terrain it had then is still
 *   there, and stays there after the Squad that saw it marches away: the fog is
 *   *memory*, not a mask that follows the army.
 * - **visible** — an eye covers it now.
 *
 * Because the fog is memory, it is *state*: who saw what when changes what a
 * Controller can decide, so it is covered by the state hash and replayed like
 * everything else (ADR-0006, ADR-0013). Two Factions never share a grid — one
 * Faction's knowledge entering the other's would be the whole point lost — and
 * `createFogs` is where that is built rather than promised.
 *
 * ## Vision, and what it is not
 *
 * Vision is a disc of tiles around an eye, and an eye is wherever a Faction has
 * something standing: a Squad, a settlement. There is no line of sight and no
 * elevation to block it, because the theatre has no playable height (ADR-0007),
 * so a hill hides nothing and a forest conceals only what its combat modifiers
 * say. Distance is compared squared, in integers, so a radius is exact and no
 * engine has to agree about a square root (ADR-0006).
 *
 * ## Eyes, and who owns them
 *
 * `refreshVision` takes the eyes as an argument and knows nothing about where
 * they came from: the rules that own the Squads and the settlements are the
 * rules that can name them, and this module is handed the answer. That is also
 * what makes the fog testable with no world at all — an eye is three integers.
 *
 * ## The view, and the inspection mode
 *
 * `viewOf` projects a fog into the shape a Controller reads, and the shape is
 * the fog itself: the memory, what is in view, and the last known contacts.
 * Plain data, structured-cloneable, and *small* — there is nothing in it that a
 * Faction has not seen. `inspectionView` is the other side of that: the whole
 * theatre known, for debugging, and deliberately not a Player. It answers with
 * a view and has no `decide`, so it cannot emit a Command (`tests/sim/fog.test.ts`
 * makes that a compile error); the game's omniscient mode watches, and nothing
 * else.
 */
import type { SettlementMemory } from './settlement-knowledge.ts';
import type { Faction } from './faction.ts';
import {
  isTerrain,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_COUNT,
  terrainAt,
  tileIndex,
  type MapGrid,
  type Site,
  type Terrain,
} from './map.ts';
import { requireTickCount } from './ticks.ts';

/**
 * How much of a tile a Faction knows, which is what the three states are called
 * once something has to name them (GLOSSARY: Fog of war).
 *
 * The numbers are the fog's own order: a tile is unexplored until it has been
 * seen, remembered once it has, and visible only while an eye is on it. Nothing
 * in state holds them — they are derived from the two grids — so a report may
 * print the word.
 */
export const KNOWLEDGE = {
  unexplored: 0,
  remembered: 1,
  visible: 2,
} as const;

/** One of the three states a tile is in, as far as one Faction is concerned. */
export type Knowledge = (typeof KNOWLEDGE)[keyof typeof KNOWLEDGE];

/**
 * What the memory grid holds where a tile has never been seen.
 *
 * `TERRAIN` is a small list of small numbers, so a value no terrain can have is
 * the marker: one grid answers both "how much is known" and "what is believed",
 * and the two cannot drift apart the way a seen-flag beside a terrain grid
 * could. Every terrain the map knows is well below this, and `isTerrain` is what
 * keeps it that way.
 */
export const UNSEEN = 255;

/**
 * Something an enemy had standing somewhere, the last time the Faction looked
 * (GLOSSARY: Last known contact).
 *
 * Identity and position are the rules' own vocabulary — this module does not
 * know a Squad from a settlement — so `kind` is whatever integer the rules give
 * it, and `seen` is the tick the fog last observed it. A last known contact is
 * *memory*: it keeps the place it was seen at after the thing itself marches out
 * of view, and it is the only thing a Faction knows about where the enemy is.
 */
export interface LastKnownContact {
  /** The rules' own id for the thing: never reused, so an old memory cannot find a new enemy. */
  readonly id: number;
  /** What it is, in the rules' vocabulary, as the integer state holds. */
  readonly kind: number;
  /** The tile it was last seen standing on. */
  readonly x: number;
  /** The tile it was last seen standing on. */
  readonly y: number;
  /** The tick it was last observed on. */
  readonly seen: number;
}

/**
 * An enemy the rules can see right now: identity and where it stands, before the
 * fog stamps it as last known and remembers it.
 *
 * Not a `LastKnownContact` with the tick left off, because the two are different
 * things: this one is *now* — a Squad in the open, standing where the rules know
 * it is — and whether the Faction ever learns of it is the fog's decision, not
 * the rules'.
 */
export interface EnemyInSight {
  /** The rules' own id for the thing. */
  readonly id: number;
  /** What it is, in the rules' vocabulary, as the integer state holds. */
  readonly kind: number;
  /** The tile it is standing on now. */
  readonly x: number;
  /** The tile it is standing on now. */
  readonly y: number;
}

/**
 * What a Faction knows, as a Controller may read it: the terrain it remembers,
 * what is in view, and the last known contacts.
 *
 * Three parallel grids and a list, all plain data, so the driver's copy carries
 * them (the projection must be structured-cloneable — `sim/observation.ts`) and
 * a renderer can draw from the same object a Controller reads.
 */
export interface FogView {
  /** The terrain as last seen, per tile: `UNSEEN` where the Faction has never looked. */
  readonly terrain: Uint8Array;
  /** `1` where an eye covers the tile now, `0` where it does not. */
  readonly visible: Uint8Array;
  /** The last known contacts, one per enemy id, in id order. */
  readonly contacts: readonly LastKnownContact[];
}

/**
 * One Faction's fog, as the rules hold it: the same three things a view has, and
 * writable.
 *
 * A `Fog` *is* a `FogView` — the state is readable as the view, and the view is
 * what a Controller is handed after the driver copies it. What makes that safe
 * is `sim/driver.ts`'s copy rather than a second shape: there is one projection
 * type per Match, and it is the one the Observation carries.
 */
export interface Fog extends FogView {
  /** Private authoritative numeric snapshots; public appearance DTOs decode these. */
  settlements?: SettlementMemory[];
  readonly terrain: Uint8Array;
  readonly visible: Uint8Array;
  readonly contacts: LastKnownContact[];
}

/** Where a Faction is looking from, and how far. */
export interface Eye {
  /** The tile the eye stands on. */
  readonly x: number;
  /** The tile the eye stands on. */
  readonly y: number;
  /** How far it sees, in tiles: the disc of that radius, inclusive. */
  readonly radius: number;
}

/**
 * How far a settlement sees, in tiles.
 *
 * A settlement watches its own ground and the road leaving it, and no more: at
 * a radius of eight it covers a 17×17 neighbourhood — 289 tiles, about a
 * thirty-second of the theatre — so home is known and the road to the enemy is
 * not. A Squad's own vision is shorter and is the Squad's business (C1, D4);
 * this is the radius the Stronghold a Match opens with looks out to.
 */
export const SETTLEMENT_VISION = 8;

/**
 * How far a Squad sees, in tiles.
 *
 * Less than a settlement and more than the tile it stands on: a marching Squad
 * is what discovers the theatre (PLAN §4: "vision is a radius around the
 * Faction's own Squads and settlements"), so it has to see far enough ahead to
 * be worth sending, and not so far that a settlement's own watch is redundant.
 * Four tiles is a nine-by-nine neighbourhood around every Squad.
 *
 * C2 is the ticket that puts a Squad's eyes on this radius: the page refreshes
 * the fog from the Squads its Observation holds, so what a Player sees on screen
 * follows the men they are marching.
 */
export const SQUAD_VISION = 4;

/** A Faction's fog, knowing nothing: every tile unexplored and no contact remembered. */
export function createFog(): Fog {
  const terrain = new Uint8Array(TILE_COUNT);
  terrain.fill(UNSEEN);

  return { terrain, visible: new Uint8Array(TILE_COUNT), contacts: [], settlements: [] };
}

/**
 * Both Factions' fogs, one each.
 *
 * Two calls to `createFog` rather than two views of one grid, and the difference
 * is the whole of the honesty: a fog one Faction writes must be one the other
 * does not read, and a shared grid would put what Rome has seen into Carthage's
 * Observation and its state hash together (`tests/sim/fog.test.ts` asserts the
 * grids are not the same objects).
 */
export function createFogs(): Readonly<Record<Faction, Fog>> {
  return { rome: createFog(), carthage: createFog() };
}

/** The eye something standing on the map sees from, at the radius it sees to. */
export function eyeOf(site: Site, radius: number): Eye {
  return { x: site.x, y: site.y, radius };
}

/** The same disc for a visible enemy and for a tile of visible terrain. */
export function eyeCovers(eye: Eye, site: Site): boolean {
  const dx = site.x - eye.x;
  const dy = site.y - eye.y;
  return dx * dx + dy * dy <= eye.radius * eye.radius;
}

/**
 * Recomputes what one Faction can see this tick, and remembers what it saw.
 *
 * Called by the rules on every tick with the eyes the Faction has — its Squads
 * and the settlements it holds. What was in view last tick is *recomputed*
 * rather than added to: a tile no eye covers any more is out of view, and stays
 * in the memory grid. That is the difference between the two grids, and the
 * reason a Squad can march away from ground its Faction still knows.
 *
 * @throws RangeError when an eye is not a whole tile of the theatre, or its
 *   radius is not a whole non-negative number of tiles.
 */
export function refreshVision(fog: Fog, map: MapGrid, eyes: readonly Eye[]): void {
  // Every eye is checked before anything is written: a refused call leaves the
  // fog exactly as it was, rather than with what is in view wiped and nothing
  // remembered in its place.
  for (const eye of eyes) requireEye(eye);

  fog.visible.fill(0);

  for (const eye of eyes) stamp(fog, map, eye);
}

/**
 * What a Faction knows of one tile: unexplored, remembered, or in view.
 *
 * @throws RangeError when the coordinates are not whole tiles of the theatre.
 */
export function knows(fog: FogView, x: number, y: number): Knowledge {
  const tile = tileOf(x, y);

  if (fog.terrain[tile] === UNSEEN) return KNOWLEDGE.unexplored;

  return fog.visible[tile] === 1 ? KNOWLEDGE.visible : KNOWLEDGE.remembered;
}

/**
 * The terrain a Faction believes stands on a tile: what it remembers, or `null`
 * where it has never looked.
 *
 * This is what makes the memory a fact rather than a flag: a Controller that
 * asks about a tile its Faction has never seen learns nothing about it, and one
 * that asks about a tile it saw long ago learns what was there — which may no
 * longer be what is there, and is exactly what "last known" means.
 *
 * @throws RangeError when the coordinates are not whole tiles of the theatre.
 */
export function believedTerrain(fog: FogView, x: number, y: number): Terrain | null {
  const ground = fog.terrain[tileOf(x, y)];

  return ground === undefined || ground === UNSEEN ? null : terrainOf(ground);
}

/**
 * The projection of a fog: what a Controller may read of it.
 *
 * The three things the fog holds — the terrain memory, what is in view, and the
 * last known contacts — as plain, structured-cloneable data. The driver copies
 * it before a Controller sees it, so handing the arrays over here is safe; what
 * it must never do is carry anything the Faction has not seen, which is a
 * property of the grids rather than of this function (the memory holds `UNSEEN`
 * where nothing was ever written down).
 */
export function viewOf(fog: Fog): FogView {
  return { terrain: fog.terrain, visible: fog.visible, contacts: fog.contacts };
}

/**
 * The whole theatre, known: the debugging inspection mode (PLAN §4).
 *
 * It is deliberately not a Player and cannot become one: what it returns is a
 * view, and a view has no `decide`. Nothing here can emit a Command, so an
 * omniscient eye can watch a Match and never play it — the Game Master's view,
 * for looking at a bug, and not a third Faction.
 *
 * The view is a *copy* of the terrain rather than the map's own grid: seeing
 * everything is not the same as holding the world, and a debug view that aliased
 * the map would be a grip on state with no Command behind it (A5 review, F2).
 */
export function inspectionView(map: MapGrid, contacts: readonly LastKnownContact[] = []): FogView {
  const visible = new Uint8Array(TILE_COUNT);
  visible.fill(1);

  return { terrain: Uint8Array.from(map.terrain), visible, contacts: [...contacts] };
}

/**
 * Remembers the enemy contacts a Faction can see this tick, and leaves the rest
 * of the memory alone.
 *
 * The fog does the filtering, not the rules: a sighting of something standing
 * outside what the Faction is looking at now is *not* remembered, so a rule
 * cannot hand a Faction knowledge its eyes never reached. What the rules hand
 * over is a list of enemy things with the place each stands on; what the fog
 * keeps is the last place each was seen, and the tick it was seen on — which is
 * why an enemy that marches out of view is remembered where it was, and not
 * tracked live.
 *
 * The memory is one contact per id, so a later sighting replaces the earlier
 * one, and the list is kept in id order: the order sightings arrive in is the
 * rules' business, and a Match must not hash differently because a Squad
 * happened to be listed before a settlement.
 *
 * @throws RangeError when the tick is not a whole non-negative number of ticks,
 *   or a sighting does not stand on a tile of the theatre.
 */
export function observeContacts(fog: Fog, inSight: readonly EnemyInSight[], tick: number): void {
  requireTickCount(tick, 'a contact\'s tick', 0);

  for (const enemy of inSight) {
    if (knows(fog, enemy.x, enemy.y) !== KNOWLEDGE.visible) continue;

    remember(fog, { id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, seen: tick });
  }

  fog.contacts.sort((left, right) => left.id - right.id);
}

/**
 * Drops contacts from the memory, by id.
 *
 * Forgetting is a rule rather than a decay here: a Squad destroyed in combat
 * (C3) or a settlement taken (C5) is a thing the rules know happened, and only
 * they can say so. How long a stale contact is worth planning against is D4's
 * question; this is where the memory is told to let one go.
 */
export function forgetContacts(fog: Fog, ids: readonly number[]): void {
  for (const id of ids) {
    const at = fog.contacts.findIndex((contact) => contact.id === id);
    if (at >= 0) fog.contacts.splice(at, 1);
  }
}

/** One contact, remembered in the place it stands: replaces the earlier memory of the same enemy. */
function remember(fog: Fog, contact: LastKnownContact): void {
  const at = fog.contacts.findIndex((remembered) => remembered.id === contact.id);

  if (at < 0) fog.contacts.push(contact);
  else fog.contacts[at] = contact;
}

/** Paints one eye's disc into both grids: in view now, and remembered from here on. */
function stamp(fog: Fog, map: MapGrid, eye: Eye): void {
  const top = Math.max(0, eye.y - eye.radius);
  const bottom = Math.min(MAP_HEIGHT - 1, eye.y + eye.radius);
  const left = Math.max(0, eye.x - eye.radius);
  const right = Math.min(MAP_WIDTH - 1, eye.x + eye.radius);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (!eyeCovers(eye, { x, y })) continue;

      const tile = tileIndex(x, y);
      fog.visible[tile] = 1;
      fog.terrain[tile] = terrainAt(map, x, y);
    }
  }
}

/**
 * Checks that two numbers name a tile of the theatre, and hands back its index.
 *
 * The one place that decides what a tile is, so a rule, the renderer and the
 * page's hooks refuse the same coordinates with the same sentence.
 *
 * @throws RangeError when the coordinates are not whole tiles inside the map.
 */
export function requireTile(x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
    throw new RangeError(`a tile must be a whole tile of the theatre, got (${String(x)}, ${String(y)})`);
  }

  return tileIndex(x, y);
}

/** @throws RangeError when an eye is not a whole tile of the theatre, or its radius is not whole. */
function requireEye(eye: Eye): void {
  requireTile(eye.x, eye.y);

  if (!Number.isInteger(eye.radius) || eye.radius < 0) {
    throw new RangeError(`an eye's radius must be a whole non-negative number of tiles, got ${String(eye.radius)}`);
  }
}

/** @throws RangeError when the coordinates are not whole tiles of the theatre. */
function tileOf(x: number, y: number): number {
  return requireTile(x, y);
}

/** The terrain a remembered number names. @throws RangeError when it names none. */
function terrainOf(ground: number): Terrain {
  if (!isTerrain(ground)) throw new RangeError(`the fog remembers ${String(ground)}, which is not a terrain`);

  return ground;
}
