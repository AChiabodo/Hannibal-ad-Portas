/**
 * The settlements a Faction can see, as the map and the interface read them
 * (ticket U6, ADR-0020).
 *
 * The rules hold settlements by id, and the minimap (`ui/minimap.ts`) has always
 * drawn them as one coloured pixel through the fog. The main map now draws them as
 * structures, and the panel has to open one when a Player clicks it, so both need
 * the same answer to one question: *which settlements may this Faction see, and
 * what does it know of each?*
 *
 * That answer is one list, `knownSites`, computed from three things and nothing
 * else:
 *
 * - **the theatre** (`siteIdentities`): where the settlements stand, which of them
 *   are Strongholds, and the id the economy gives each. This is geography — the
 *   map is generated from the seed and both Factions could draw it — and it is
 *   the same list the minimap walks. A test pins the ids against `createEconomy`,
 *   so the two cannot drift.
 * - **the Faction's Observation** (`SiegeVisible`): the settlements it owns, the
 *   contacts it remembers, and the fronts it holds, besieges or has an eye on.
 * - **the fog the theatre is drawn through** (`FogView`): what the *picture* knows.
 *   A settlement whose tile is unexplored is not in the list at all, exactly as the
 *   minimap paints nothing there — and it is the fog the veil is drawn from, not a
 *   second opinion about it, so a Stronghold cannot be drawn on ground the screen is
 *   showing as night. The page passes its own fog here, which in a played Match is
 *   the same memory the Observation's fronts were filtered by.
 *
 * Everything else is *derived*, and each derivation is the one the rules already
 * make:
 *
 * - **Ownership** comes from the Observation and only while the settlement is in
 *   view: an own settlement is the Faction's; a contact explicitly confirmed
 *   unowned is held by nobody, and other contacts in view are the enemy's.
 *   A **remembered** settlement has no owner: memory
 *   records a settlement, not who holds it today, which is the rule the minimap
 *   states in its own colour for a remembered site. Its *kind* — Stronghold or minor
 *   settlement — is remembered, because that is what was seen standing there.
 * - **Condition** comes from a front, and a front only when the Faction can see the
 *   settlement now. A remembered contact carries no wall, gate, breach or ram, so a
 *   remembered site has `front: null` and the drawing shows a settlement remembered,
 *   not damage inferred.
 *
 * The module is pure — a function of the map, the Observation and the fog — so a
 * test can compose a Match in Node and read what a Player would be shown.
 */
import type { SettlementKind, SiteMemory } from '../art/settlements.ts';
import type { SiegeVisible, VisibleFront } from '../sim/siege.ts';
import { KNOWLEDGE, knows, type FogView } from '../sim/fog.ts';
import type { Faction } from '../sim/faction.ts';
import { TILE_COUNT, type MapGrid } from '../sim/map.ts';

/** A settlement on the theatre, as the map states it: where it is, what it is, and its id. */
export interface SiteIdentity {
  /** The id the economy gives it, which is what a Command names and a panel shows. */
  readonly id: number;

  /** A Stronghold, or a minor settlement. */
  readonly kind: SettlementKind;

  /** The tile it stands on. */
  readonly x: number;

  /** The tile it stands on. */
  readonly y: number;
}

/** One settlement the Faction may see, and everything it knows of it. */
export interface KnownSite extends SiteIdentity {
  /** Only completed works explicitly present in the own Observation. */
  readonly camp?: boolean;
  /** The Faction known to hold it, or `null` for a settlement nobody — or nobody known — holds. */
  readonly owner: Faction | null;

  /** Whether the Faction is looking at it now, or remembers it. */
  readonly memory: SiteMemory;

  /**
   * The front of its Siege, when the Faction can see it now: its walls, its gate,
   * its ram and the garrison on them (ADR-0020). `null` for a settlement
   * remembered, and for one seen that has no front in the Observation.
   */
  readonly front: VisibleFront | null;
}

/**
 * Every settlement on a theatre, by id: the two Strongholds first, then the minor
 * settlements, which is the order the economy opens them in.
 *
 * The ids are the economy's (`createEconomy` numbers the Strongholds 0 and 1 and
 * the settlements after them), and `tests/ui/sites.test.ts` walks a thousand
 * seeds' worth of one map and compares the two lists rather than trusting the
 * comment.
 */
export function siteIdentities(map: MapGrid): readonly SiteIdentity[] {
  return [
    ...map.strongholds.map((site, index) => ({ id: index, kind: 'stronghold' as const, x: site.x, y: site.y })),
    ...map.settlements.map((site, index) => ({
      id: map.strongholds.length + index,
      kind: 'settlement' as const,
      x: site.x,
      y: site.y,
    })),
  ];
}

/**
 * The settlements this Faction may see, and what it knows of each, in the theatre's
 * own order.
 *
 * A settlement is in the list when the Faction holds it, when it remembers it as a
 * contact, or when its tile has been seen — the three facts the fog and the
 * Observation between them record. A settlement nobody holds and nobody has looked
 * at is not in the list, which is what keeps an unseen minor settlement off the map.
 *
 * @throws RangeError when the fog is not over this theatre, which is the only one
 *   this project has; a view of another size is a caller that has lost track of
 *   which map it is looking at.
 */
export function knownSites(
  identities: readonly SiteIdentity[],
  visible: SiegeVisible,
  fog: FogView,
  faction: Faction,
): readonly KnownSite[] {
  requireTheatre(fog);
  const own = new Map(visible.settlements.map((settlement) => [settlement.id, settlement]));
  const contacts = new Map(
    visible.contacts.filter((contact) => contact.kind !== 'squad').map((contact) => [contact.id, contact]),
  );
  const fronts = new Map(visible.fronts.map((front) => [front.settlement, front]));
  const enemy: Faction = faction === 'rome' ? 'carthage' : 'rome';

  const sites: KnownSite[] = [];
  for (const identity of identities) {
    const mine = own.has(identity.id);
    const contact = contacts.get(identity.id);
    const knowledge = knows(fog, identity.x, identity.y);

    if (!mine && contact === undefined && knowledge === KNOWLEDGE.unexplored) continue;

    if (mine) {
      sites.push({ ...identity, owner: faction, memory: 'seen', front: fronts.get(identity.id) ?? null,
        ...(own.get(identity.id)?.works.some((work) => work.building === 'castrum' && work.standing) === true ? { camp: true } : {}) });
      continue;
    }

    const memory: SiteMemory = knowledge === KNOWLEDGE.visible ? 'seen' : 'remembered';
    sites.push({
      ...identity,
      // Current vision distinguishes an unowned village from an enemy-held
      // settlement. Memory never reports who holds it today.
      owner: memory === 'seen' && contact !== undefined && contact.unowned !== true ? enemy : null,
      memory,
      // Only what is in view has a front: memory holds a settlement, not its walls.
      front: memory === 'seen' ? fronts.get(identity.id) ?? null : null,
    });
  }

  return sites;
}

/** @throws RangeError when the view is not over this project's theatre. */
function requireTheatre(fog: FogView): void {
  if (fog.terrain.length !== TILE_COUNT || fog.visible.length !== TILE_COUNT) {
    throw new RangeError(
      `the fog is over ${String(fog.terrain.length)} tiles, and this theatre has ${String(TILE_COUNT)}`,
    );
  }
}
