/**
 * The paper dolls (ticket C2).
 *
 * A figure is composed from parts, so the things worth pinning are the ones a
 * composition can get wrong: that every frame exists and is the same size, that
 * the four directions are four different drawings and not one of them reused,
 * that the mirror really is a mirror, that the two Factions are told apart by
 * cloth, and — the ticket's own acceptance criterion — that the three lines of
 * the Roman roster read as three different *silhouettes* rather than three
 * colours of the same drawing.
 */
import { describe, expect, it } from 'vitest';
import {
  FIGURE_ACTIONS,
  FIGURE_FACTION,
  FIGURE_FACINGS,
  FIGURE_FRAMES,
  FIGURE_HEIGHT,
  FIGURE_LOOKS,
  FIGURE_NAMES,
  FIGURE_WIDTH,
  FRAMES_OF,
  figureEntries,
  figureFrame,
  frameName,
  soldier,
  type FigureFacing,
  type FigureFrame,
  type FigureName,
} from '../../src/art/figures';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import { SQUAD_TYPES } from '../../src/content/squads';

/** The frame a test asks for most often: standing still. */
const IDLE: FigureFrame = { action: 'idle', step: 0 };

/** How many pixels of a buffer have any ink in them. */
function ink(buffer: PixelBuffer): number {
  let painted = 0;
  for (let index = 3; index < buffer.pixels.length; index += 4) if ((buffer.pixels[index] ?? 0) > 0) painted += 1;

  return painted;
}

/** The rectangle the ink occupies: a silhouette's extent. */
function extent(buffer: PixelBuffer): { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number } {
  let top = buffer.height;
  let bottom = -1;
  let left = buffer.width;
  let right = -1;

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      if (pixelAt(buffer, x, y)[3] === 0) continue;

      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  return { top, bottom, left, right };
}

describe('a soldier', () => {
  it('is drawn at one size, with his feet on the ground line', () => {
    for (const name of FIGURE_NAMES) {
      for (const facing of FIGURE_FACINGS) {
        for (const frame of FIGURE_FRAMES) {
          const figure = soldier(name, facing, frame);

          expect({ width: figure.width, height: figure.height }, `${name} ${facing} ${frameName(frame)}`).toEqual({
            width: FIGURE_WIDTH,
            height: FIGURE_HEIGHT,
          });
          // Every standing frame stands on the last row: a man is never a pixel
          // above or below the block he is drawn in.
          if (frame.action !== 'death') {
            expect(extent(figure).bottom, `${name} ${facing} ${frameName(frame)}`).toBe(FIGURE_HEIGHT - 1);
          }
        }
      }
    }
  });

  it('is four different drawings for four directions, not one drawing reused', () => {
    const hashes = FIGURE_FACINGS.map((facing) => hashPixelBuffer(soldier('hastati', facing, IDLE)));

    expect(new Set(hashes).size).toBe(FIGURE_FACINGS.length);
  });

  it('mirrors west from east, pixel for pixel', () => {
    const east = soldier('principes', 'east', IDLE);
    const west = soldier('principes', 'west', IDLE);

    for (let y = 0; y < FIGURE_HEIGHT; y += 1) {
      for (let x = 0; x < FIGURE_WIDTH; x += 1) {
        expect(pixelAt(west, x, y), `west (${String(x)}, ${String(y)})`).toEqual(
          pixelAt(east, FIGURE_WIDTH - 1 - x, y),
        );
      }
    }
  });

  it('shows the back of a man from behind: the front mirrored, with his face painted out', () => {
    const south = soldier('principes', 'south', IDLE);
    const north = soldier('principes', 'north', IDLE);

    for (let y = 0; y < FIGURE_HEIGHT; y += 1) {
      for (let x = 0; x < FIGURE_WIDTH; x += 1) {
        // The head and the arms are where the two deliberately differ: a man
        // facing the camera has a face and bare arms, and a man facing away has
        // the back of his head and his cloak over both.
        if (y >= 5 && y <= 9) continue;

        expect(pixelAt(north, x, y), `north (${String(x)}, ${String(y)})`).toEqual(
          pixelAt(south, FIGURE_WIDTH - 1 - x, y),
        );
      }
    }

    // Nobody's face is visible from behind: the head's skin belongs to the front.
    const skinAtHead = (figure: PixelBuffer): number => {
      let skin = 0;
      for (let x = 0; x < FIGURE_WIDTH; x += 1) {
        for (let y = 5; y <= 6; y += 1) {
          const pixel = pixelAt(figure, x, y);
          if (pixel[3] > 0 && pixel[0] === 129 && pixel[1] === 121) skin += 1;
        }
      }

      return skin;
    };

    expect(skinAtHead(south)).toBeGreaterThan(0);
    expect(skinAtHead(north)).toBe(0);
  });

  it('walks and strikes in frames of their own, none of them the standing pose', () => {
    for (const name of FIGURE_NAMES) {
      const idle = hashPixelBuffer(soldier(name, 'south', figureFrame('idle', 0)));
      const walk = [0, 1].map((step) => hashPixelBuffer(soldier(name, 'south', figureFrame('walk', step))));
      const attack = [0, 1].map((step) => hashPixelBuffer(soldier(name, 'south', figureFrame('attack', step))));

      expect(walk[0], `${name} walk:0`).not.toBe(idle);
      expect(walk[1], `${name} walk:1`).not.toBe(walk[0]);
      expect(attack[0], `${name} attack:0`).not.toBe(idle);
      expect(attack[1], `${name} attack:1`).not.toBe(attack[0]);
    }
  });

  it('lies down when he dies, in a frame shorter than he stands', () => {
    for (const name of FIGURE_NAMES) {
      const standing = extent(soldier(name, 'south', IDLE));
      const fallen = extent(soldier(name, 'south', figureFrame('death', 0)));

      expect(fallen.bottom - fallen.top, name).toBeLessThan(standing.bottom - standing.top);
      // A body on the ground is wider than it is tall: that is what tells a
      // death frame from a man standing still at the lowest zoom.
      expect(fallen.right - fallen.left, name).toBeGreaterThan(fallen.bottom - fallen.top);
    }
  });

  it('wears his Faction’s cloth: the two palettes are different drawings', () => {
    for (const name of FIGURE_NAMES) {
      const roman = soldier(name, 'south', IDLE, 'rome');
      const carthaginian = soldier(name, 'south', IDLE, 'carthage');

      expect(hashPixelBuffer(carthaginian), name).not.toBe(hashPixelBuffer(roman));
      // The same soldier, though: the same pixels are painted, in other colours.
      expect(ink(carthaginian), name).toBe(ink(roman));
    }
  });

  it('tells the three lines of the roster apart by silhouette, not by colour', () => {
    const hastati = extent(soldier('hastati', 'south', IDLE));
    const principes = extent(soldier('principes', 'south', IDLE));
    const triarii = extent(soldier('triarii', 'south', IDLE));

    // The helmets and the weapons are what change the height: the third line's
    // spear reaches over every other man's head.
    expect(triarii.top).toBeLessThan(principes.top);
    expect(principes.top).toBeLessThan(hastati.top);

    // And the shields are what change the shape: the hastatus' little parma is
    // narrower than the principes' scutum, which is narrower than the triarius'
    // great round one.
    const shieldWidth = (frame: PixelBuffer): number => extent(frame).right - extent(frame).left;
    expect(shieldWidth(soldier('hastati', 'south', IDLE))).toBeLessThan(
      shieldWidth(soldier('triarii', 'south', IDLE)),
    );
  });

  it('draws the same pixels for the same question, every time', () => {
    const first = soldier('triarii', 'east', figureFrame('attack', 1), 'carthage');
    const again = soldier('triarii', 'east', figureFrame('attack', 1), 'carthage');

    expect(hashPixelBuffer(again)).toBe(hashPixelBuffer(first));
  });

  it('refuses a frame, a step or a soldier it does not draw', () => {
    expect(() => soldier('hastati', 'south', { action: 'idle', step: 1 })).toThrow(/no frame 1/);
    expect(() => soldier('hastati', 'south', figureFrame('walk', 2))).toThrow(/no frame 2/);
    expect(() => soldier('velites' as FigureName, 'south', IDLE)).toThrow(/roster/);
    expect(() => soldier('hastati', 'north' as FigureFacing, figureFrame('death', 0), 'greek' as 'rome')).toThrow(
      /Faction/,
    );
  });
});

describe('the figure catalogue', () => {
  it('holds every soldier of the roster, in every direction and every frame, exactly once', () => {
    const entries = figureEntries();
    const names = entries.map((entry) => entry.name);

    expect(entries.length).toBe(FIGURE_NAMES.length * FIGURE_FACINGS.length * FIGURE_FRAMES.length);
    expect(new Set(names).size).toBe(names.length);

    for (const name of FIGURE_NAMES) {
      for (const facing of FIGURE_FACINGS) {
        for (const frame of FIGURE_FRAMES) {
          expect(names).toContain(`figure:${name}:${facing}:${frameName(frame)}`);
        }
      }
    }
  });

  it('states how many frames each action has, and has that many', () => {
    for (const action of FIGURE_ACTIONS) {
      const frames = FIGURE_FRAMES.filter((frame) => frame.action === action);

      expect(frames.length, action).toBe(FRAMES_OF[action]);
      for (const frame of frames) expect(frame.step).toBeLessThan(FRAMES_OF[action]);
    }
  });

  it('names a single-frame action by its action and the others by their step', () => {
    expect(frameName(figureFrame('idle', 0))).toBe('idle');
    expect(frameName(figureFrame('death', 0))).toBe('death');
    expect(frameName(figureFrame('walk', 1))).toBe('walk:1');
    expect(frameName(figureFrame('attack', 0))).toBe('attack:0');
  });

  it('names its figures so that an agent can ask for one by name', () => {
    const names = figureEntries().map((entry) => entry.name);

    for (const expected of [
      'figure:hastati:south:idle',
      'figure:principes:east:attack:1',
      'figure:triarii:north:death',
      'figure:libyan-spear:south:idle',
      'figure:numidian-horse:north:walk:0',
      'figure:elephant:east:attack:1',
    ]) {
      expect(names).toContain(expected);
    }
  });
});

/** Every figure the roster draws, for a test that wants to walk all of them. */
function everyFigure(): readonly { readonly name: FigureName; readonly facing: FigureFacing; readonly frame: FigureFrame }[] {
  return FIGURE_NAMES.flatMap((name) =>
    FIGURE_FACINGS.flatMap((facing) => FIGURE_FRAMES.map((frame) => ({ name, facing, frame }))),
  );
}

describe('the whole roster', () => {
  it('has ink in every one of its drawings', () => {
    for (const { name, facing, frame } of everyFigure()) {
      expect(ink(soldier(name, facing, frame)), `${name} ${facing} ${frameName(frame)}`).toBeGreaterThan(20);
    }
  });
});

/**
 * A figure in greyscale: the luminance of every pixel, or `-1` where there is no
 * ink at all.
 *
 * The ticket's criterion is that the two rosters are told apart **in greyscale**,
 * so a test that compared hues would be testing the thing the criterion says not
 * to rely on. Luminance is what survives a desaturated screenshot, and it is
 * what a player at the lowest zoom actually reads.
 */
function greyscale(figure: FigureName): readonly number[] {
  const drawn = soldier(figure, 'south', IDLE);
  const shades: number[] = [];

  for (let y = 0; y < FIGURE_HEIGHT; y += 1) {
    for (let x = 0; x < FIGURE_WIDTH; x += 1) {
      const pixel = pixelAt(drawn, x, y);
      shades.push(pixel[3] === 0 ? -1 : Math.round((pixel[0] * 30 + pixel[1] * 59 + pixel[2] * 11) / 100));
    }
  }

  return shades;
}

/** How many pixels of two greyscale drawings differ enough to be seen. */
function tellableFrom(one: readonly number[], other: readonly number[]): number {
  let differing = 0;

  for (let index = 0; index < one.length; index += 1) {
    const left = one[index] ?? -1;
    const right = other[index] ?? -1;
    if (left < 0 || right < 0) {
      if (left !== right) differing += 1;
      continue;
    }
    if (Math.abs(left - right) >= 24) differing += 1;
  }

  return differing;
}

/**
 * A figure's silhouette alone: which pixels have ink, whatever colour they are.
 *
 * The greyscale comparison above still lets the Faction's cloth count — which is
 * honest, a desaturated screenshot does differ — but the ticket's criterion is a
 * difference of *shape and equipment*, so this is the same comparison with the
 * palette taken out of it entirely.
 */
function silhouette(figure: FigureName): readonly boolean[] {
  const drawn = soldier(figure, 'south', IDLE);
  const ink: boolean[] = [];

  for (let y = 0; y < FIGURE_HEIGHT; y += 1) {
    for (let x = 0; x < FIGURE_WIDTH; x += 1) ink.push(pixelAt(drawn, x, y)[3] !== 0);
  }

  return ink;
}

describe('the two rosters', () => {
  it('draws every Squad type the content table knows, in its own Faction’s cloth', () => {
    for (const type of SQUAD_TYPES) {
      expect(FIGURE_LOOKS[type.id as FigureName], type.id).toBeDefined();
      expect(FIGURE_FACTION[type.id as FigureName], type.id).toBe(type.faction);
    }
  });

  it('gives every type that carries a shield a kind of its own, and the two that carry none none', () => {
    const kinds = FIGURE_NAMES.filter((name) => {
      const look = FIGURE_LOOKS[name];
      return look.kind === 'soldier' && look.shield !== 'none';
    }).map((name) => {
      const look = FIGURE_LOOKS[name];
      return look.kind === 'soldier' ? look.shield : 'none';
    });
    const shieldless = FIGURE_NAMES.filter((name) => {
      const look = FIGURE_LOOKS[name];
      return look.kind === 'soldier' && look.shield === 'none';
    });

    expect(new Set(kinds).size).toBe(kinds.length);
    expect(shieldless).toEqual(['balearic-slinger', 'numidian-horse']);
    expect(FIGURE_LOOKS.elephant.kind).toBe('beast');
  });

  it('tells every pair of the two rosters apart in greyscale, by shape and equipment', () => {
    for (let first = 0; first < FIGURE_NAMES.length; first += 1) {
      for (let second = first + 1; second < FIGURE_NAMES.length; second += 1) {
        const one = FIGURE_NAMES[first];
        const other = FIGURE_NAMES[second];
        if (one === undefined || other === undefined) continue;

        // Two figures that no longer differ in a desaturated drawing are two
        // figures a player cannot tell apart at the lowest zoom.
        expect(tellableFrom(greyscale(one), greyscale(other)), `${one} vs ${other}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('does it by silhouette and equipment, with the palette taken out', () => {
    for (let first = 0; first < FIGURE_NAMES.length; first += 1) {
      for (let second = first + 1; second < FIGURE_NAMES.length; second += 1) {
        const one = FIGURE_NAMES[first];
        const other = FIGURE_NAMES[second];
        if (one === undefined || other === undefined) continue;

        const left = silhouette(one);
        const right = silhouette(other);
        let differing = 0;
        for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) differing += 1;

        // Same ink and no ink are the only two colours here, so this is the
        // shapes talking and nothing else.
        expect(differing, `${one} vs ${other}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('puts a horse under the one mounted type, and no horse under any other', () => {
    const mounted = FIGURE_NAMES.filter((name) => {
      const look = FIGURE_LOOKS[name];
      return look.kind === 'soldier' && look.mount === 'horse';
    });

    expect(mounted).toEqual(['numidian-horse']);

    // The horse is a wider base than two feet: the bottom row of a horseman has
    // more ink in it than the bottom row of a man on foot.
    const bottomRow = (name: FigureName): number => {
      const drawn = soldier(name, 'south', IDLE);
      let painted = 0;
      for (let x = 0; x < FIGURE_WIDTH; x += 1) if (pixelAt(drawn, x, FIGURE_HEIGHT - 1)[3] !== 0) painted += 1;
      return painted;
    };

    expect(bottomRow('numidian-horse')).toBeGreaterThan(bottomRow('hastati'));
  });

  it('draws the elephant as one bulky beast, not a man with a shield', () => {
    const elephant = soldier('elephant', 'south', IDLE);
    const man = soldier('hastati', 'south', IDLE);

    // Bulk is the beast's signature: it fills more of the same ten-by-fourteen
    // box than a man does, and its death is a heap wider than it is tall.
    expect(ink(elephant)).toBeGreaterThan(ink(man) * 1.4);
    const fallen = extent(soldier('elephant', 'south', figureFrame('death', 0)));
    expect(fallen.right - fallen.left).toBeGreaterThan(fallen.bottom - fallen.top);
  });
});
