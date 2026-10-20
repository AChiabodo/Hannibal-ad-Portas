/**
 * The settlement and fortification art (ticket U6).
 *
 * The ticket asks for "recognizable silhouettes and condition states", and those
 * are the two claims worth holding. **Silhouette** is measured, not copied: a
 * village has to be a scatter of roofs and a Stronghold a closed stone ring, and
 * the two have to be tellable apart from nothing but which pixels are painted.
 * **Condition** is measured at the place it is drawn: a breach on the north wall
 * has to leave a hole in the north wall, a damaged wall has to still be a wall,
 * and a ram has to stand at the gate it is battering.
 *
 * The last group is the ticket's hardest rule: **memory carries no condition**. A
 * remembered place is drawn without an owner's cloth, without a gate, without
 * damage — so the test asserts the strongest form of that: a remembered Stronghold
 * is *the same picture* whatever the front says its walls are, and every colour in
 * a remembered drawing comes from the stone ramp.
 */
import { describe, expect, it } from 'vitest';
import { DETAIL_RAMPS, RAMPS, shadeAt } from '../../src/art/palette';
import { pixelAt, rotateQuarterTurns, type PixelBuffer, type Rgba } from '../../src/art/pixel-buffer';
import { catalogue, cataloguePlate } from '../../src/art/catalogue';
import {
  SETTLEMENT_KINDS,
  SITE_OWNERS,
  SITE_SIZE,
  SITE_SPECIMENS,
  settlementEntries,
  siteLookKey,
  siteMark,
  siteSprite,
  type SettlementLook,
  type SiteCondition,
  type SiteSide,
} from '../../src/art/settlements';

/** Four walls, whole. */
const INTACT: Readonly<Record<SiteSide, SiteCondition>> = {
  north: 'intact',
  east: 'intact',
  south: 'intact',
  west: 'intact',
};

/** A walled Stronghold held by Rome, seen now, unless a test says otherwise. */
function walled(over: Partial<SettlementLook> = {}): SettlementLook {
  return {
    kind: 'stronghold',
    owner: 'rome',
    memory: 'seen',
    gateSide: 'south',
    gate: 'intact',
    walls: INTACT,
    ram: 'none',
    ...over,
  };
}

/** An open settlement held by Rome, seen now. */
function village(over: Partial<SettlementLook> = {}): SettlementLook {
  return { ...walled(over), kind: 'settlement', gate: null, walls: INTACT, ram: 'none' };
}

/** Whether a pixel was painted at all. */
function painted(sprite: PixelBuffer, x: number, y: number): boolean {
  return pixelAt(sprite, x, y)[3] !== 0;
}

/** How many pixels of a sprite are painted. */
function ink(sprite: PixelBuffer): number {
  let count = 0;
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) if (painted(sprite, x, y)) count += 1;
  }

  return count;
}

/** Whether a drawing paints a colour anywhere. */
function uses(sprite: PixelBuffer, colour: Rgba): boolean {
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      const pixel = pixelAt(sprite, x, y);
      if (pixel[3] !== 0 && pixel[0] === colour[0] && pixel[1] === colour[1] && pixel[2] === colour[2]) return true;
    }
  }

  return false;
}

/** The pixels two drawings do not agree on. */
function differences(left: PixelBuffer, right: PixelBuffer): readonly { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];

  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const a = pixelAt(left, x, y);
      const b = pixelAt(right, x, y);
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) found.push({ x, y });
    }
  }

  return found;
}

/** Whether a colour is one of a ramp's shades. */
function inRamp(colour: Rgba, ramp: readonly Rgba[]): boolean {
  return ramp.some((shade) => shade[0] === colour[0] && shade[1] === colour[1] && shade[2] === colour[2]);
}

/** How many pixels in a rectangle of a sprite are painted. */
function inkIn(sprite: PixelBuffer, left: number, top: number, width: number, height: number): number {
  let count = 0;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) if (painted(sprite, x, y)) count += 1;
  }

  return count;
}

/** The middle of a sprite, which is where a gate and a keep stand. */
function centre(size: number): number {
  return Math.floor(size / 2);
}

describe('the size and the identity of a place', () => {
  it('draws every kind at its declared size, and draws it the same way twice', () => {
    for (const kind of SETTLEMENT_KINDS) {
      const sprite = siteSprite(walled({ kind }));
      expect(sprite.width, kind).toBe(SITE_SIZE[kind]);
      expect(sprite.height, kind).toBe(SITE_SIZE[kind]);
      expect(ink(sprite), kind).toBeGreaterThan(200);
    }

    expect(siteSprite(walled())).toBe(siteSprite(walled()));
  });

  it('gives every look a name, so two drawings can be told apart without pixels', () => {
    const keys = new Set([
      siteLookKey(walled()),
      siteLookKey(walled({ gate: 'breached' })),
      siteLookKey(walled({ walls: { ...INTACT, north: 'breached' } })),
      siteLookKey(walled({ owner: 'carthage' })),
      siteLookKey(walled({ memory: 'remembered' })),
      siteLookKey(village()),
    ]);

    expect(keys.size).toBe(6);
  });
});

describe('a recognizable silhouette', () => {
  it('is a stone ring, closed on all four sides, when the place is walled', () => {
    const town = siteSprite(walled());
    const size = SITE_SIZE.stronghold;
    const middle = centre(size);

    // The four sides, at the middle of each: a wall on every one of them, in the
    // outer sixth of the drawing where a wall is.
    expect(inkIn(town, 2, middle - 2, 8, 4), 'west wall').toBeGreaterThan(20);
    expect(inkIn(town, size - 10, middle - 2, 8, 4), 'east wall').toBeGreaterThan(20);
    expect(inkIn(town, middle - 2, 2, 4, 8), 'north wall').toBeGreaterThan(20);
    expect(inkIn(town, middle - 2, size - 10, 4, 8), 'south wall').toBeGreaterThan(20);
  });

  it('is a scatter of roofs, with air at its edges, when the place is open', () => {
    const roofs = siteSprite(village());
    const size = SITE_SIZE.settlement;
    const middle = centre(size);

    expect(ink(roofs)).toBeGreaterThan(120);
    // No wall: the outer two pixels of the drawing are the roofs' own outline at
    // most, and the middle of the village is its well rather than a courtyard.
    expect(inkIn(roofs, 0, middle - 2, 3, 4), 'no west wall').toBe(0);
    expect(inkIn(roofs, size - 3, middle - 2, 3, 4), 'no east wall').toBe(0);
    expect(painted(roofs, middle, middle), 'a well in the middle').toBe(true);
  });

  it('is twice the town for a Stronghold, which is not a village with a roof changed', () => {
    expect(ink(siteSprite(walled()))).toBeGreaterThan(ink(siteSprite(village())) * 2);
  });
});

describe('a condition, drawn where it is', () => {
  const size = SITE_SIZE.stronghold;
  const middle = centre(size);

  /** How much of a north wall's walk, one row under its merlons, is painted. */
  const walk = (sprite: PixelBuffer): number => inkIn(sprite, 8, 4, 40, 1);

  it('leaves a hole in the wall it names, and in no other', () => {
    const whole = siteSprite(walled());

    for (const side of ['north', 'east', 'south', 'west'] as const) {
      const changed = differences(whole, siteSprite(walled({ walls: { ...INTACT, [side]: 'breached' } })));
      const third = size / 3;

      expect(changed.length, side).toBeGreaterThan(20);
      for (const pixel of changed) {
        if (side === 'north') expect(pixel.y, `north ${String(pixel.x)}`).toBeLessThan(third);
        if (side === 'south') expect(pixel.y, `south ${String(pixel.x)}`).toBeGreaterThan(2 * third);
        if (side === 'west') expect(pixel.x, `west ${String(pixel.y)}`).toBeLessThan(third);
        if (side === 'east') expect(pixel.x, `east ${String(pixel.y)}`).toBeGreaterThan(2 * third);
      }
    }
  });

  it('opens a hole a Player can see, beside the gate rather than behind it', () => {
    const whole = siteSprite(walled());
    const breached = siteSprite(walled({ walls: { ...INTACT, north: 'breached' } }));

    // Two gaps, and the walk between them left standing: fourteen pixels of hole at
    // one-to-one zoom is a breach, not a dent.
    expect(walk(whole) - walk(breached), 'the walk is broken').toBeGreaterThan(12);
    expect(painted(breached, middle, 4), 'the middle of a wall is left alone').toBe(true);

    // What is left lies at the foot of each gap, so a breach reads as rubble and
    // not as a wall that was never drawn.
    expect(inkIn(breached, middle - 15, 5, 8, 5), 'rubble at one gap').toBeGreaterThan(0);
    expect(inkIn(breached, middle + 8, 5, 8, 5), 'rubble at the other').toBeGreaterThan(0);

    // And on the gate's own side the gatehouse is untouched: a wall breaks beside
    // its gate, so a Player is never told of a breach the gate is hiding.
    const south = differences(whole, siteSprite(walled({ walls: { ...INTACT, south: 'breached' } })));
    expect(south.some((pixel) => pixel.x > middle - 7 && pixel.x < middle + 7 && pixel.y > 43)).toBe(false);
  });

  it('keeps a damaged wall a wall: a notch and a crack, and no gap through it', () => {
    const whole = siteSprite(walled());
    const hurt = siteSprite(walled({ walls: { ...INTACT, north: 'damaged' } }));

    expect(differences(whole, hurt).length).toBeGreaterThan(10);

    // Every column of the north wall still carries stone: hurt is not broken.
    for (let x = 10; x < size - 10; x += 1) {
      expect(inkIn(hurt, x, 3, 1, 8), `column ${String(x)}`).toBeGreaterThan(0);
    }
  });

  it('draws the gate on the side the rules say, by turning the whole town', () => {
    // The town is drawn with its gate south and turned to face the side: a gate on
    // the north is the same drawing a half-turn round, which is one drawing and
    // four compass points rather than four gates.
    const south = siteSprite(walled({ gateSide: 'south' }));

    expect(siteSprite(walled({ gateSide: 'north' }))).toEqual(rotateQuarterTurns(south, 2));
    expect(siteSprite(walled({ gateSide: 'west' }))).toEqual(rotateQuarterTurns(south, 1));
    expect(siteSprite(walled({ gateSide: 'east' }))).toEqual(rotateQuarterTurns(south, 3));
  });

  it('draws a broken gate as an opening, and a whole one as timber', () => {
    const whole = siteSprite(walled({ gate: 'intact' }));
    const broken = siteSprite(walled({ gate: 'breached' }));

    expect(painted(whole, middle, 48), 'the gate is a thing').toBe(true);
    expect(painted(broken, middle, 48), 'and a broken gate is a hole').toBe(true);
    expect(differences(whole, broken).length).toBeGreaterThan(6);
    // An open settlement has no gatehouse at all, so its drawing has no timber
    // doors where a Stronghold's are.
    expect(differences(siteSprite(walled({ gate: null })), whole).length).toBeGreaterThan(6);
  });

  it('stands the ram at the gate it batters, and nowhere else', () => {
    const none = siteSprite(walled());
    const built = siteSprite(walled({ ram: 'built' }));
    const changed = differences(none, built);

    expect(changed.length).toBeGreaterThan(20);
    for (const pixel of changed) {
      // Outside the town, on the gate's side, within a shed's width of the middle.
      expect(pixel.y, `y ${String(pixel.y)}`).toBeGreaterThan(size * 0.72);
      expect(Math.abs(pixel.x - middle), `x ${String(pixel.x)}`).toBeLessThan(8);
    }

    // Built is a roof over the frame; under construction is the frame alone.
    expect(differences(siteSprite(walled({ ram: 'building' })), built).length).toBeGreaterThan(10);
  });
});

describe('a place remembered', () => {
  it('is drawn without an owner’s cloth, whatever it was held by', () => {
    const cloth = [shadeAt(RAMPS.bronze, 6), shadeAt(RAMPS.blood, 6)];

    // The seen drawings carry the banner each Faction flies...
    expect(uses(siteSprite(walled({ owner: 'rome' })), cloth[0]!)).toBe(true);
    expect(uses(siteSprite(walled({ owner: 'carthage' })), cloth[1]!)).toBe(true);

    // ...and the remembered one carries neither, whichever Faction held it.
    for (const owner of ['rome', 'carthage'] as const) {
      expect(uses(siteSprite(walled({ owner, memory: 'remembered' })), cloth[0]!)).toBe(false);
      expect(uses(siteSprite(walled({ owner, memory: 'remembered' })), cloth[1]!)).toBe(false);
    }
  });

  it('is stone and nothing else: every pixel comes from the stone ramp', () => {
    const remembered = siteSprite(walled({ memory: 'remembered', gate: 'breached', ram: 'built' }));

    for (let y = 0; y < remembered.height; y += 1) {
      for (let x = 0; x < remembered.width; x += 1) {
        const colour = pixelAt(remembered, x, y);
        if (colour[3] === 0) continue;

        expect(inRamp(colour, DETAIL_RAMPS.stone), `${String(x)},${String(y)}`).toBe(true);
      }
    }
  });

  it('carries no condition: the same memory of a whole wall and a broken one', () => {
    const remembered = walled({ memory: 'remembered' });

    expect(siteSprite({ ...remembered, gate: 'breached', walls: { ...INTACT, north: 'breached' }, ram: 'built' }))
      .toEqual(siteSprite(remembered));
  });
});

describe('the catalogue and the selection mark', () => {
  it('publishes every specimen, once, at the size its kind is drawn', () => {
    const entries = settlementEntries();
    const names = new Set(entries.map((entry) => entry.name));

    expect(entries.length).toBe(SITE_SPECIMENS.length);
    expect(names.size).toBe(entries.length);

    for (const [index, entry] of entries.entries()) {
      const specimen = SITE_SPECIMENS[index];
      if (specimen === undefined) throw new Error('a specimen went missing');

      expect(entry.buffer.width).toBe(SITE_SIZE[specimen.look.kind]);
    }
  });

  it('gives every specimen a row of its own on the plate, so none is hidden by another', () => {
    const plate = cataloguePlate();

    // A drawing is on the plate when every one of a sample of its *painted* pixels is
    // found at the same offset somewhere on it — the gaps are the plate showing
    // through, so they say nothing — and the sample is what makes the search cheap,
    // with a full comparison on the candidate making it exact.
    const found = (sprite: PixelBuffer): boolean => {
      const probes: { x: number; y: number }[] = [];
      for (let y = 0; y < sprite.height; y += 7) {
        for (let x = 0; x < sprite.width; x += 7) if (painted(sprite, x, y)) probes.push({ x, y });
      }

      for (let top = 0; top + sprite.height <= plate.height; top += 1) {
        for (let left = 0; left + sprite.width <= plate.width; left += 1) {
          const candidate = probes.every(({ x, y }) => {
            const a = pixelAt(plate, left + x, top + y);
            const b = pixelAt(sprite, x, y);

            return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
          });
          if (!candidate) continue;

          let exact = true;
          for (let y = 0; y < sprite.height && exact; y += 1) {
            for (let x = 0; x < sprite.width && exact; x += 1) {
              if (!painted(sprite, x, y)) continue;

              const a = pixelAt(plate, left + x, top + y);
              const b = pixelAt(sprite, x, y);
              if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) exact = false;
            }
          }
          if (exact) return true;
        }
      }

      return false;
    };

    for (const entry of settlementEntries()) expect(found(entry.buffer), entry.name).toBe(true);
  });

  it('is in the catalogue, so the Atelier shows it beside everything else', () => {
    const published = catalogue().filter((entry) => entry.name.startsWith('site:'));

    expect(published.map((entry) => entry.name)).toEqual(SITE_SPECIMENS.map((specimen) => specimen.name));
  });

  it('covers both Factions, every condition and the two kinds of memory', () => {
    const looks = SITE_SPECIMENS.map((specimen) => specimen.look);

    expect(new Set(looks.flatMap((look) => (look.owner === 'none' ? [] : [look.owner])))).toEqual(
      new Set(['rome', 'carthage']),
    );
    expect(new Set(looks.flatMap((look) => Object.values(look.walls)))).toContain('breached');
    expect(new Set(looks.flatMap((look) => Object.values(look.walls)))).toContain('damaged');
    expect(looks.some((look) => look.ram === 'built')).toBe(true);
    expect(new Set(looks.map((look) => look.memory))).toEqual(new Set(['seen', 'remembered']));
    expect(new Set(looks.map((look) => look.kind))).toEqual(new Set(SETTLEMENT_KINDS));
    expect(new Set(looks.map((look) => look.owner))).toEqual(new Set(SITE_OWNERS));
  });

  it('brackets a selected place in its corners, and nowhere in the middle', () => {
    for (const kind of SETTLEMENT_KINDS) {
      const mark = siteMark(kind);
      const size = SITE_SIZE[kind];

      expect(mark.width).toBe(size);
      expect(painted(mark, 0, 0)).toBe(true);
      expect(painted(mark, size - 1, size - 1)).toBe(true);
      expect(painted(mark, centre(size), centre(size))).toBe(false);
    }
  });
});
