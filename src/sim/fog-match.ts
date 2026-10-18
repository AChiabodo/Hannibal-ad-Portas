/**
 * The Match the fog is part of: a theatre, two Factions, and what each of them
 * knows of the other (ticket B4, PLAN §4).
 *
 * B1 generated the theatre and B4 built the fog; this is the two of them in a
 * Match that runs through the ordinary driver, with an Observation that is the
 * Faction's own memory rather than a view of the world. Nothing stands on the
 * map yet — Squads are C1's, the settlements an economy is B6's — so a Faction's
 * eyes are the one settlement it starts with, its Stronghold, and the whole of a
 * tick is the visibility pass around it.
 *
 * Two things here are worth reading closely:
 *
 * - **`step` recomputes both Factions' vision on every tick.** It does not
 *   accumulate, and it does not track: the fog it leaves is the fog the map and
 *   the eyes describe, and an event that moved the eyes changes what is in view
 *   without touching what is remembered (`sim/fog.ts`). That is why the tick is
 *   cheap and why the memory is honest — memory is written on the way *in* to a
 *   tile, never on the way out.
 * - **`observeFogMatch` projects the looking Faction's fog and nothing else.**
 *   Not the map, not the other Faction's grid, not the world. A Controller
 *   therefore cannot be handed a tile its Faction has not seen, because there is
 *   nothing for `viewOf` to hand it from.
 *
 * The eyes are *derived* and not state: they are the Strongholds of the map —
 * the settlements each Faction holds when a Match opens — so there is no second
 * copy of where a Faction is looking from that could drift out of step with the
 * map. The day a Faction's eyes are its Squads as well as its settlements (C1),
 * or a settlement can change hands (C5), it is `eyesOf` that grows and nothing
 * else.
 *
 * **What this Match does not yet have: an enemy.** The fog's memory of last
 * known contacts (`observeContacts`, in `fog.ts`) is built and tested, and the
 * pipeline carries it into every Observation — but nothing on this theatre
 * belongs to a Faction, so no contact has ever been observed and every
 * Observation here holds an empty list. Calling it would mean inventing an id
 * and a kind for a Stronghold that never moves, and the id space is a thing the
 * rules must own: the day a Squad or a settlement can be seen by the other side
 * (C1, C3, D4), that rule hands the fog what it can see and the memory is what
 * the Faction plans against. Nothing else has to change.
 */
import type { Command } from './command.ts';
import type { MatchSetup, Outcome } from './driver.ts';
import { FACTIONS, type Faction } from './faction.ts';
import { createFogs, eyeOf, refreshVision, viewOf, SETTLEMENT_VISION, type Eye, type Fog, type FogView } from './fog.ts';
import { generateMap, type MapGrid } from './map.ts';
import type { MatchRules } from './match.ts';

/**
 * Everything the rules of this Match own: the theatre, and each Faction's memory
 * of it.
 *
 * The map is state — the Match begins on the theatre its seed generated, and a
 * replay that began on another one would not be the same Match — and the two
 * fogs are state for the same reason, turned around: what a Faction has seen
 * decides what it can decide, so a Match whose memory differed would not be the
 * same Match either (ADR-0006, ADR-0013).
 */
export interface FogMatchWorld {
  /** The theatre both Factions are looking at (B1). */
  readonly map: MapGrid;

  /** What each Faction has seen, remembers and is looking at now (B4). */
  readonly fog: Readonly<Record<Faction, Fog>>;
}

/**
 * What a Faction may see of this Match: its own fog, and nothing else.
 *
 * The type is `fog.ts`'s own rather than one of its own, because there is
 * nothing this Match would hide that a fog view does not already hide: a
 * projection of a projection would be a second shape to keep in step, for no
 * gain.
 */
export type FogMatchVisible = FogView;

/**
 * The eyes one Faction has on a theatre nothing has been built on yet: the
 * Stronghold it starts in.
 *
 * A settlement's own vision (a Squad's is shorter and is C1's), which is what
 * makes the first minute of a Match a known neighbourhood around home and an
 * unknown map beyond it. The map holds the two Strongholds in `FACTIONS` order,
 * so the Faction names which one is its own.
 *
 * A Stronghold is read here as *held* by the Faction it opens for. That is true
 * of every Match this branch can play — nobody can take one yet — and it stops
 * being obviously true the day a settlement changes hands (C5), which is why
 * holding is stated as the reason rather than left as an index into the map.
 */
export function eyesOf(map: MapGrid, faction: Faction): readonly Eye[] {
  const [rome, carthage] = map.strongholds;

  return [eyeOf(faction === 'rome' ? rome : carthage, SETTLEMENT_VISION)];
}

/** Recomputes both Factions' vision from their own eyes: the whole of a tick in this Match. */
function refreshBoth(world: FogMatchWorld): void {
  for (const faction of FACTIONS) {
    refreshVision(world.fog[faction], world.map, eyesOf(world.map, faction));
  }
}

/** The world a Match begins on: the theatre the seed generates, and what each Faction can see of it. */
export function createFogMatchWorld(seed: number): FogMatchWorld {
  const world: FogMatchWorld = { map: generateMap(seed), fog: createFogs() };
  refreshBoth(world);

  return world;
}

/**
 * The rules of the Match: build the theatre from the seed, and recompute what
 * each Faction sees on every tick.
 *
 * No Command is obeyed here, because there is nothing on the map to command: a
 * `move` names a Squad that does not exist, and a rule that quietly did
 * something plausible with it would be worse than one that does nothing at all.
 * The Command still reaches the log — the driver writes down what was asked for
 * whether or not a rule acts on it — so a Match played with scripts replays
 * exactly like any other.
 */
export const fogMatchRules: MatchRules<FogMatchWorld, Command> = {
  createWorld: (seed) => createFogMatchWorld(seed),

  step: (world) => {
    refreshBoth(world);
  },
};

/**
 * What a Faction may see of the Match: its own fog, projected.
 *
 * Field by field rather than by handing the world over, which is the difference
 * between an Observation and a hole: the driver copies what this returns, and
 * what it returns holds nothing that the Faction looking has not seen. The other
 * Faction's grid is not read here, so it cannot leak — there is no branch that
 * could.
 */
export const observeFogMatch: MatchSetup<FogMatchWorld, FogMatchVisible>['observe'] = (world, faction) =>
  viewOf(world.fog[faction]);

/**
 * The verdict of this Match: none, ever.
 *
 * A theatre nobody stands on cannot be lost, so nothing can decide the Match
 * before its bound. Returning `null` is the honest answer while it is true; the
 * rules that end a Match arrive with the systems that can end one (C5).
 */
export const fogMatchOutcome: MatchSetup<FogMatchWorld, FogMatchVisible>['outcome'] = (): Outcome | null => null;
