/**
 * The Squads on the stage: one sprite per Squad, its Faction's standard, and the
 * annotations a selected (or a troubled) Squad wears (#58).
 *
 * `render/squads.ts` composes a Squad's men into one `PixelBuffer`;
 * `render/indicators.ts` composes what the theatre says *about* it. This module is
 * the one step that needs the engine — a buffer becomes a texture and a texture
 * becomes a sprite — and it is deliberately thin, because every decision worth
 * checking (which men, in what order, in which frame, which mark, which
 * condition) is made in Node and is checked there.
 *
 * **One sprite per Squad, not one per man.** A hundred and twenty men per block
 * and a dozen blocks would be fourteen hundred sprites before anything else is
 * drawn, which is not what a page that has to stay responsive spends its frame
 * on (F3 measures the rest). The men are composed once into a block, and the
 * block is re-composed only when the shape it draws has changed — which is what
 * `squadFrameKey` is for: a Squad standing still does no work at all, and a
 * marching one uploads a new texture when it steps, not sixty times a second.
 *
 * **The annotations are separate sprites**, for the same reason: a Morale that
 * moves a point must not re-upload a hundred and twenty soldiers. They live in
 * their own container above the men, so an annotation is never hidden by a block;
 * the Faction's standard lives in one below, so a standard never hides the men it
 * marks.
 *
 * **Depth is the tile a Squad stands on.** Blocks are tall and they overlap, so
 * the one drawn in front has to be the one further down the screen: the Sprite's
 * `zIndex` is its Squad's row, and the layer's container sorts its children by
 * it. That is also what makes clicking the right block possible — the same order
 * a Player sees is the order `input/selection.ts` picks in.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { VisibleSquad } from '../sim/economy-match.ts';
import type { Corpse } from '../sim/residue.ts';
import type { Facing } from '../sim/squad.ts';
import type { OrderMarkKind } from '../art/markers.ts';
import {
  markedConditions,
  squadConditions,
} from '../ui/conditions.ts';
import { CORPSE_FADE_STEPS, corpseFade, corpsePlacement, corpseSprite, figureOf } from './corpses.ts';
import {
  CONDITION_PIN_SIZE,
  CONDITION_PLATE_WIDTH,
  DESTINATION_SIZE,
  conditionKey,
  conditionOf,
  conditionPin,
  conditionPlate,
  destinationMark,
  facingMark,
  markerPlacement,
} from './indicators.ts';
import { textureOf } from './stage.ts';
import { blockPlacement, squadBlock, squadFrameKey, visualShape } from './squads.ts';
import { tilePixel } from './terrain.ts';
import { standardInsignia } from '../art/figures.ts';

/** What the layer is handed on every redraw: the world as the Player may see it. */
export interface SquadField {
  /** The Faction's own Squads, as its Observation names them. */
  readonly squads: readonly VisibleSquad[];

  /** The Squad ids the Player has picked, which are ringed on the map. */
  readonly selected: readonly number[];

  /** The tick the frames are chosen from. Never wall time (ADR-0006). */
  readonly tick: number;

  /**
   * The men who fell, as `sim/residue.ts` records them (C3).
   *
   * Residue and not state: a corpse is drawn, fades on a tick and is swept away,
   * and nothing here may write back into it.
   */
  readonly corpses?: readonly Corpse[];

  /** Which Faction's cloth the soldiers wear. */
  readonly faction: 'rome' | 'carthage';

  /**
   * The kind of destination mark each Squad's order wears, when the page knows it.
   *
   * A `VisibleSquad` carries *where* it is walking and not *how* it was told to:
   * `attackMove` and `move` are the same route once the rules have them. So the
   * page remembers the verb it submitted and hands it here, which is what makes a
   * march and an attack-march different marks on the ground without inventing
   * state the Match does not hold.
   */
  readonly orderMarks?: Readonly<Record<number, OrderMarkKind>>;
}

/** The layer: one call, and the stage agrees with the field. */
export interface SquadLayer {
  /** Brings the sprites into line with the field: moved, re-drawn, added or removed. */
  update(field: SquadField): void;

  /**
   * Shows or hides every block and every annotation at once.
   *
   * The debugging surface B3 opened for the fog — "is the ground under this
   * drawn the way the generator says" — needs the map alone, and an army
   * standing on it is a hundred and twenty men between the camera and the
   * answer. Hiding them changes nothing about the Match: it is a lens, not a
   * rule, and no Controller can see through it.
   */
  setVisible(visible: boolean): void;
}

/** One Squad's sprite, and what it was last drawn from. */
interface Drawn {
  readonly sprite: Sprite;
  key: string;
}

/**
 * How far above the theatre a Squad's sprite sorts, so it is drawn over the map
 * and the fog.
 *
 * The dead sort at the same height and one below, because a body belongs to the
 * ground it fell on: a block of men standing over a corpse must hide it, and a
 * corpse must never be drawn over the men still fighting.
 */
const ABOVE_THE_MAP = 10;

/** Where the standards sort: above the dead, below every soldier. */
const STANDARD_LAYER = ABOVE_THE_MAP + 0.5;

/** Where the annotations sort: over every soldier, because they are about the map. */
const INDICATOR_LAYER = ABOVE_THE_MAP + 2;

/** How far above every annotation a destination mark sorts, so it is never hidden. */
const ABOVE_EVERY_BLOCK = 1000;

/**
 * The layer the living are drawn in, exported so picking agrees with drawing.
 *
 * A click compares the layer a Squad is drawn in with the layer a settlement is
 * (`render/settlement-layer.ts`): the men stand over the settlements they are in, so
 * a Squad is picked before one, whatever rows the two are on (ticket U6).
 */
export const SQUAD_LAYER = ABOVE_THE_MAP + 1;


/**
 * Builds the layer under a container the camera is applied to, with nothing
 * drawn until the first field arrives.
 *
 * @param parent The camera's container: the men are in the world, not on the
 *   screen, so a pan moves them with the ground they stand on.
 */
export function createSquadLayer(parent: Container): SquadLayer {
  const fallen = new Container();
  fallen.sortableChildren = true;
  fallen.zIndex = ABOVE_THE_MAP;
  parent.addChild(fallen);

  const standards = new Container();
  standards.sortableChildren = true;
  standards.zIndex = STANDARD_LAYER;
  parent.addChild(standards);

  const root = new Container();
  root.sortableChildren = true;
  root.zIndex = SQUAD_LAYER;
  parent.addChild(root);

  const annotations = new Container();
  annotations.sortableChildren = true;
  annotations.zIndex = INDICATOR_LAYER;
  parent.addChild(annotations);

  const squads = new Map<number, Drawn>();
  const marks = new Map<number, Sprite>();
  const corpses = new Map<string, Sprite>();
  const corpseTextures = new Map<string, Texture>();
  const standardSprites = new Map<number, Sprite>();
  const standardTextures = new Map<string, Texture>();
  const plates = new Map<number, PlateSprite>();
  const plateTextures = new Map<string, Texture>();
  const pins = new Map<number, PlateSprite>();
  const pinTextures = new Map<string, Texture>();
  const facings = new Map<number, FacingSprite>();
  const facingTextures = new Map<Facing, Texture>();
  const destinationTextures = new Map<OrderMarkKind, Texture>();

  return {
    setVisible(visible) {
      root.visible = visible;
      fallen.visible = visible;
      standards.visible = visible;
      annotations.visible = visible;
    },

    update(field) {
      const afield = new Set(field.squads.map((squad) => squad.id));

      for (const squad of field.squads) {
        const selected = field.selected.includes(squad.id);
        const key = squadFrameKey(squad, { tick: field.tick, faction: field.faction, selected });
        const drawn = squads.get(squad.id);
        const shape = visualShape(squad);
        const at = blockPlacement(tilePixel(squad.x, squad.y), shape);
        const placement = markerPlacement(tilePixel(squad.x, squad.y), shape);

        if (drawn === undefined) {
          const sprite = new Sprite(textureOf(squadBlock(squad, { tick: field.tick, faction: field.faction, selected })));
          sprite.position.set(at.x, at.y);
          sprite.zIndex = squad.y;
          root.addChild(sprite);
          squads.set(squad.id, { sprite, key });
        } else {
          if (drawn.key !== key) {
            // A new shape: a new texture, and the one before it let go rather
            // than kept. A marching block re-draws on the tick it steps, so a
            // page left open for an hour is not an hour of textures.
            const next = textureOf(squadBlock(squad, { tick: field.tick, faction: field.faction, selected }));
            drawn.sprite.texture.destroy(true);
            drawn.sprite.texture = next;
            drawn.key = key;
          }
          drawn.sprite.position.set(at.x, at.y);
          drawn.sprite.zIndex = squad.y;
        }

        standard(standards, standardSprites, standardTextures, squad, field.faction, placement.standard);
        annotate(annotations, {
          plates, plateTextures, pins, pinTextures, facings, facingTextures, destinationTextures, marks,
        }, squad, selected, placement, field.orderMarks?.[squad.id] ?? 'move');
      }

      for (const [id, drawn] of squads) {
        if (afield.has(id)) continue;

        drawn.sprite.texture.destroy(true);
        drawn.sprite.destroy();
        squads.delete(id);
      }

      for (const [id, sprite] of marks) {
        if (afield.has(id)) continue;

        sprite.destroy();
        marks.delete(id);
      }

      for (const [id, sprite] of standardSprites) {
        if (afield.has(id)) continue;

        sprite.destroy();
        standardSprites.delete(id);
      }
      for (const [id, entry] of plates) {
        if (afield.has(id)) continue;

        entry.sprite.destroy();
        plates.delete(id);
      }
      for (const [id, entry] of pins) {
        if (afield.has(id)) continue;

        entry.sprite.destroy();
        pins.delete(id);
      }
      for (const [id, entry] of facings) {
        if (afield.has(id)) continue;

        entry.sprite.destroy();
        facings.delete(id);
      }

      layOutTheDead(fallen, corpses, corpseTextures, field.corpses ?? [], field.tick);
    },
  };
}

/** A sprite and the plate key it was drawn from, replaced in place when the key moves. */
interface PlateSprite {
  readonly sprite: Sprite;
  key: string;
}

/** A chevron and the facing it was drawn for. */
interface FacingSprite {
  readonly sprite: Sprite;
  facing: Facing;
}

/** The sets an annotation pass shares across squads. */
interface AnnotationSinks {
  readonly plates: Map<number, PlateSprite>;
  readonly plateTextures: Map<string, Texture>;
  readonly pins: Map<number, PlateSprite>;
  readonly pinTextures: Map<string, Texture>;
  readonly facings: Map<number, FacingSprite>;
  readonly facingTextures: Map<Facing, Texture>;
  readonly destinationTextures: Map<OrderMarkKind, Texture>;
  readonly marks: Map<number, Sprite>;
}

/**
 * The Faction's standard above a Squad's block.
 *
 * One sprite per Squad, one texture per Faction: a standard never changes shape,
 * so the whole army shares two drawings. It sorts below every block, so the pole
 * may run behind the men while the cloth flies above them.
 */
function standard(
  parent: Container,
  sprites: Map<number, Sprite>,
  textures: Map<string, Texture>,
  squad: VisibleSquad,
  faction: 'rome' | 'carthage',
  at: { readonly x: number; readonly y: number },
): void {
  let texture = textures.get(faction);
  if (texture === undefined) {
    texture = textureOf(standardInsignia(faction));
    textures.set(faction, texture);
  }

  const known = sprites.get(squad.id);
  if (known === undefined) {
    const sprite = new Sprite(texture);
    sprite.position.set(at.x, at.y);
    sprite.zIndex = squad.y;
    parent.addChild(sprite);
    sprites.set(squad.id, sprite);

    return;
  }

  known.position.set(at.x, at.y);
  known.zIndex = squad.y;
}

/**
 * What one Squad wears: a status plate and a facing chevron when it is picked, a
 * destination mark when it has one, and a small condition pin when it is neither
 * picked nor healthy.
 *
 * The rule the ticket states is the rule here: **no permanent bars or labels on a
 * healthy, unselected Squad**. A Squad in trouble keeps one small shape, so that
 * a Player scanning the theatre sees that something is wrong without every block
 * carrying a plaque.
 */
function annotate(
  parent: Container,
  sinks: AnnotationSinks,
  squad: VisibleSquad,
  selected: boolean,
  placement: ReturnType<typeof markerPlacement>,
  orderMark: OrderMarkKind,
): void {
  const conditions = squadConditions(squad);

  if (selected) {
    syncPlate(parent, sinks, squad, placement.condition);
    syncFacing(parent, sinks, squad, placement.facing);
    syncMark(parent, sinks, squad, orderMark);
    dropPin(sinks, squad.id);
  } else {
    dropPlate(sinks, squad.id);
    dropFacing(sinks, squad.id);
    dropMark(sinks, squad.id);
    syncPin(parent, sinks, squad, conditions, placement.condition);
  }
}

/** A selected Squad's condition plate, re-textured only when the plate changes. */
function syncPlate(
  parent: Container,
  sinks: AnnotationSinks,
  squad: VisibleSquad,
  at: { readonly x: number; readonly y: number },
): void {
  const look = conditionOf(squad);
  const key = conditionKey(look);
  const known = sinks.plates.get(squad.id);

  if (known === undefined) {
    let texture = sinks.plateTextures.get(key);
    if (texture === undefined) {
      texture = textureOf(conditionPlate(look));
      sinks.plateTextures.set(key, texture);
    }

    const sprite = new Sprite(texture);
    sprite.position.set(at.x, at.y);
    sprite.zIndex = squad.y;
    parent.addChild(sprite);
    sinks.plates.set(squad.id, { sprite, key });

    return;
  }

  if (known.key !== key) {
    let texture = sinks.plateTextures.get(key);
    if (texture === undefined) {
      texture = textureOf(conditionPlate(look));
      sinks.plateTextures.set(key, texture);
    }
    known.sprite.texture = texture;
    known.key = key;
  }

  known.sprite.position.set(at.x, at.y);
  known.sprite.zIndex = squad.y;
}

/** The chevron on the ground at the edge a selected Squad faces. */
function syncFacing(
  parent: Container,
  sinks: AnnotationSinks,
  squad: VisibleSquad,
  at: { readonly x: number; readonly y: number },
): void {
  const known = sinks.facings.get(squad.id);

  let texture = sinks.facingTextures.get(squad.facing);
  if (texture === undefined) {
    texture = textureOf(facingMark(squad.facing));
    sinks.facingTextures.set(squad.facing, texture);
  }

  if (known === undefined) {
    const sprite = new Sprite(texture);
    sprite.position.set(at.x, at.y);
    sprite.zIndex = squad.y;
    parent.addChild(sprite);
    sinks.facings.set(squad.id, { sprite, facing: squad.facing });

    return;
  }

  if (known.facing !== squad.facing) {
    known.sprite.texture = texture;
    known.facing = squad.facing;
  }
  known.sprite.position.set(at.x, at.y);
  known.sprite.zIndex = squad.y;
}

/** The destination mark of a selected Squad, in the shape its order was given. */
function syncMark(
  parent: Container,
  sinks: AnnotationSinks,
  squad: VisibleSquad,
  kind: OrderMarkKind,
): void {
  const goal = squad.goal;
  const known = sinks.marks.get(squad.id);

  if (goal === null) {
    if (known !== undefined) {
      known.destroy();
      sinks.marks.delete(squad.id);
    }

    return;
  }

  let texture = sinks.destinationTextures.get(kind);
  if (texture === undefined) {
    texture = textureOf(destinationMark(kind));
    sinks.destinationTextures.set(kind, texture);
  }

  const at = tilePixel(goal.x, goal.y);
  const x = at.x + Math.floor((16 - DESTINATION_SIZE) / 2);
  const y = at.y + Math.floor((16 - DESTINATION_SIZE) / 2);

  if (known === undefined) {
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    sprite.zIndex = ABOVE_EVERY_BLOCK + goal.y;
    parent.addChild(sprite);
    sinks.marks.set(squad.id, sprite);

    return;
  }

  known.texture = texture;
  known.position.set(x, y);
  known.zIndex = ABOVE_EVERY_BLOCK + goal.y;
}

/** A small plate with the most urgent condition's shape: what an unselected Squad in trouble wears. */
function syncPin(
  parent: Container,
  sinks: AnnotationSinks,
  squad: VisibleSquad,
  conditions: ReturnType<typeof squadConditions>,
  at: { readonly x: number; readonly y: number },
): void {
  const marked = markedConditions(conditions);
  const first = marked[0];

  if (first === undefined) {
    dropPin(sinks, squad.id);

    return;
  }

  const known = sinks.pins.get(squad.id);
  const key = first;
  const pinX = at.x + Math.floor((CONDITION_PLATE_WIDTH - CONDITION_PIN_SIZE) / 2);
  const pinY = at.y + 2;

  if (known === undefined) {
    let texture = sinks.pinTextures.get(key);
    if (texture === undefined) {
      texture = textureOf(conditionPin(first));
      sinks.pinTextures.set(key, texture);
    }

    const sprite = new Sprite(texture);
    sprite.position.set(pinX, pinY);
    sprite.zIndex = squad.y;
    parent.addChild(sprite);
    sinks.pins.set(squad.id, { sprite, key });

    return;
  }

  if (known.key !== key) {
    const texture = sinks.pinTextures.get(key) ?? textureOf(conditionPin(first));
    sinks.pinTextures.set(key, texture);
    known.sprite.texture = texture;
    known.key = key;
  }
  known.sprite.position.set(pinX, pinY);
  known.sprite.zIndex = squad.y;
}

/** Removes a Squad's condition plate, if it has one. */
function dropPlate(sinks: AnnotationSinks, id: number): void {
  const known = sinks.plates.get(id);
  if (known === undefined) return;

  known.sprite.destroy();
  sinks.plates.delete(id);
}

/** Removes a Squad's condition pin, if it has one. */
function dropPin(sinks: AnnotationSinks, id: number): void {
  const known = sinks.pins.get(id);
  if (known === undefined) return;

  known.sprite.destroy();
  sinks.pins.delete(id);
}

/** Removes a Squad's facing chevron, if it has one. */
function dropFacing(sinks: AnnotationSinks, id: number): void {
  const known = sinks.facings.get(id);
  if (known === undefined) return;

  known.sprite.destroy();
  sinks.facings.delete(id);
}

/** Removes a Squad's destination mark, if it has one. */
function dropMark(sinks: AnnotationSinks, id: number): void {
  const known = sinks.marks.get(id);
  if (known === undefined) return;

  known.destroy();
  sinks.marks.delete(id);
}

/**
 * Brings the field of the dead into line with the residue: laid where they fell,
 * faded by their age, and gone when their thirty seconds are up. The residue a
 * caller hands over is whatever its Faction may *see* — `render/corpses.ts`'s
 * `visibleCorpses` is the filter — because the whole list is both Factions'.
 *
 * A corpse is keyed by where and when it fell rather than by a number, because
 * residue has no ids and never gets one: two marks reported for one tile in one
 * round are one mark, and a single body is the truth about what a Player can
 * see. The step is the only thing that changes from frame to frame, and it is
 * read off the tick rather than remembered.
 */
function layOutTheDead(
  root: Container,
  drawn: Map<string, Sprite>,
  textures: Map<string, Texture>,
  corpses: readonly Corpse[],
  tick: number,
): void {
  const present = new Set<string>();

  for (const corpse of corpses) {
    const step = corpseFade(corpse, tick);
    if (step === 0) continue;

    const key = `${String(corpse.x)},${String(corpse.y)},${String(corpse.born)}`;
    if (present.has(key)) continue;
    present.add(key);

    const at = corpsePlacement(corpse);
    const known = drawn.get(key);

    if (known === undefined) {
      const lying = new Sprite(corpseTexture(textures, corpse));
      lying.position.set(at.x, at.y);
      lying.zIndex = corpse.y;
      lying.alpha = step / CORPSE_FADE_STEPS;
      root.addChild(lying);
      drawn.set(key, lying);

      continue;
    }

    known.alpha = step / CORPSE_FADE_STEPS;
  }

  for (const [key, lying] of drawn) {
    if (present.has(key)) continue;

    lying.destroy();
    drawn.delete(key);
  }
}

/**
 * The texture of one kind of corpse, composed once and shared.
 *
 * A corpse never changes shape: it lies, and then it fades. So one texture per
 * Faction and figure is the whole of what a field of the dead costs, however
 * many corpses are on it — and the drawing itself is `render/corpses.ts`'s,
 * which is checked in Node.
 */
function corpseTexture(textures: Map<string, Texture>, corpse: Corpse): Texture {
  const key = `${figureOf(corpse)}:${String(corpse.owner)}`;
  const known = textures.get(key);
  if (known !== undefined) return known;

  const composed = textureOf(corpseSprite(corpse));
  textures.set(key, composed);

  return composed;
}
