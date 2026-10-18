/**
 * The dead on the field (ticket C3).
 *
 * The claim to hold is that a corpse is residue: the same mark lies in the same
 * place on every machine, it fades on the tick its thirty seconds are up, and
 * none of it is state. The drawing itself is `art/figures.ts` — the death frame
 * of the figure the Squad was — so what is asserted here is the *decision*:
 * which body, where, and how faint.
 */
import { describe, expect, it } from 'vitest';
import { FIGURE_HEIGHT, FIGURE_WIDTH } from '../../src/art/figures';
import { CORPSE_FADE_TICKS, CORPSE_TICKS, type Corpse } from '../../src/sim/residue';
import { squadTypeCode } from '../../src/content/squads';
import {
  CORPSE_FADE_STEPS,
  corpseFade,
  corpseFigure,
  corpsePlacement,
  corpseSprite,
  figureOf,
  visibleCorpses,
} from '../../src/render/corpses';
import { createFog, eyeOf, refreshVision } from '../../src/sim/fog';
import { plainMap } from '../sim/test-map';
import { tilePixel } from '../../src/render/terrain';
import { TILE_SIZE } from '../../src/sim/map';

/** A mark on the field, as `sim/residue.ts` records one. */
function corpse(overrides: Partial<Corpse> = {}): Corpse {
  return {
    x: 20,
    y: 20,
    owner: 0,
    type: squadTypeCode('hastati') ?? 0,
    men: 9,
    born: 0,
    ...overrides,
  };
}

describe('a corpse on the field', () => {
  it('is drawn as the figure the Squad was, and never as a generic body', () => {
    expect(corpseFigure('hastati')).toBe('hastati');
    expect(corpseFigure('triarii')).toBe('triarii');
    expect(corpseFigure('libyan-spear')).toBe('triarii');
    expect(corpseFigure('no-such-type')).toBe('hastati');

    expect(figureOf(corpse({ type: squadTypeCode('triarii') ?? 0 }))).toBe('triarii');
  });

  it('is a soldier-sized sprite, so a layer can place it by its tile alone', () => {
    const drawn = corpseSprite(corpse());

    expect(drawn.width).toBe(FIGURE_WIDTH);
    expect(drawn.height).toBe(FIGURE_HEIGHT);
  });

  it('lies on its own tile, in one of a handful of places inside it', () => {
    const corner = tilePixel(20, 20);
    const places = new Set<string>();

    for (let born = 0; born < 24; born += 1) {
      const at = corpsePlacement(corpse({ born }));

      expect(at.x).toBeGreaterThanOrEqual(corner.x);
      expect(at.y).toBeGreaterThanOrEqual(corner.y);
      expect(at.x + FIGURE_WIDTH).toBeLessThanOrEqual(corner.x + TILE_SIZE + FIGURE_WIDTH);
      expect(at.y).toBeLessThanOrEqual(corner.y + TILE_SIZE - FIGURE_HEIGHT);

      places.add(`${String(at.x - corner.x)},${String(at.y - corner.y)}`);
    }

    // More than one place, so a pile of dead does not read as one dead man.
    expect(places.size).toBeGreaterThan(1);
  });

  it('scatters the same loss the same way on every machine, and two rounds differently', () => {
    expect(corpsePlacement(corpse())).toEqual(corpsePlacement(corpse()));

    expect(corpsePlacement(corpse({ born: 0 }))).not.toEqual(
      corpsePlacement(corpse({ born: 5 })),
    );
  });

  it('fades over the last second of its thirty, and is gone when its time is up', () => {
    expect(corpseFade(corpse(), 0)).toBe(CORPSE_FADE_STEPS);
    // A whole body until the fade begins...
    expect(corpseFade(corpse(), CORPSE_TICKS - CORPSE_FADE_TICKS - 1)).toBe(CORPSE_FADE_STEPS);
    // ...then halfway through its fade, on the middle shade...
    expect(corpseFade(corpse(), CORPSE_TICKS - CORPSE_FADE_TICKS / 2)).toBeLessThan(CORPSE_FADE_STEPS);
    expect(corpseFade(corpse(), CORPSE_TICKS - CORPSE_FADE_TICKS / 2)).toBeGreaterThan(1);
    // ...and on its last tick, the faintest one there is.
    expect(corpseFade(corpse(), CORPSE_TICKS - 1)).toBe(1);
    expect(corpseFade(corpse(), CORPSE_TICKS)).toBe(0);
    expect(corpseFade(corpse(), CORPSE_TICKS + 100)).toBe(0);
  });

  it('is never fainter than one step while it is still on the field', () => {
    for (let tick = 0; tick < CORPSE_TICKS; tick += 1) {
      expect(corpseFade(corpse(), tick)).toBeGreaterThanOrEqual(1);
    }
  });

  it('is drawn only where the Faction can see it, enemy dead included', () => {
    const map = plainMap();
    const fog = createFog();

    // An eye that has been and gone: the ground it covered is remembered, which
    // is exactly the state a corpse on it must not be drawn in.
    refreshVision(fog, map, [eyeOf({ x: 60, y: 60 }, 3)]);
    refreshVision(fog, map, [eyeOf({ x: 20, y: 20 }, 3)]);

    const inSight = corpse({ x: 21, y: 20 });
    const remembered = corpse({ x: 60, y: 60 });
    const unseen = corpse({ x: 80, y: 80 });

    expect(visibleCorpses([inSight, remembered, unseen], fog)).toEqual([inSight]);

    // The dead of the other Faction are drawn only on the same terms: a corpse
    // the fog is not looking at is a fact about the enemy nobody has paid for
    // (ADR-0013).
    const theirs = corpse({ x: 22, y: 20, owner: 1 });
    expect(visibleCorpses([inSight, theirs], fog)).toEqual([inSight, theirs]);
    expect(visibleCorpses([corpse({ x: 40, y: 40, owner: 1 })], fog)).toEqual([]);
  });
});
