/**
 * The palette: a handful of bases, and the ramps derived from them (ticket B2, PLAN §8).
 *
 * Every colour in the game is written down here as a number and nothing else.
 * There is no colour file, no picker and no exported swatch — a palette that
 * lives outside the source is one more asset the repository may not commit
 * (ADR-0002).
 *
 * The bases are few on purpose. Procedural art reads as noise when a generator
 * is free to reach for any colour it likes, and the plan's answer to that risk is
 * palette discipline: a generator picks a base and a shade of it, so a figure, a
 * terrain tile and a HUD glyph cannot drift apart into three different reds.
 *
 * A **ramp** is the shades of one base, darkest first, and it is *derived* — the
 * derivation is `shade` below, and it is integer arithmetic on purpose. A ramp
 * built by a formula is a ramp the whole catalogue shares; a ramp typed out by
 * hand is a ramp that only agrees with its base until someone edits one of the
 * two. The middle shade of an odd ramp *is* the base colour, exactly, which is
 * the property that makes the derivation checkable.
 */

import { type Rgba } from './pixel-buffer.ts';

/**
 * A colour from three hexadecimal channels.
 *
 * @param hex The colour as `0xRRGGBB`.
 * @param alpha The alpha channel, opaque unless a caller needs otherwise.
 * @throws RangeError when the channels are not integers in range: a colour that
 *   cannot be drawn is worth refusing where it is written down, not where it is
 *   painted.
 */
export function rgba(hex: number, alpha = 255): Rgba {
  if (!Number.isInteger(hex) || hex < 0 || hex > 0xffffff) {
    throw new RangeError(`a colour must be 0xRRGGBB, got ${String(hex)}`);
  }
  if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
    throw new RangeError(`an alpha channel must be an integer in [0, 255], got ${String(alpha)}`);
  }

  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff, alpha];
}

/**
 * The bases every other colour is derived from.
 *
 * `night`, `parchment` and `neutral` are surfaces and inks: the page, the words
 * on it, and the flat grey the Atelier judges art against. `stone`, `bronze`,
 * `blood` and `olive` are the material bases the theatre is drawn from, and each
 * carries enough of a ramp to shade a whole figure without leaving it.
 */
export const BASE = {
  /** The dark behind everything, and the page's own background. */
  night: rgba(0x14110d),
  /** The dark ink the Atelier draws glyphs in, on its neutral plate. */
  ink: rgba(0x0f0d0a),
  /** Light text on a dark ground. */
  parchment: rgba(0xd8cbb4),
  /** The Atelier's flat grey: neutral, so nothing judged on it is flattered. */
  neutral: rgba(0x808080),
  /** Grey-brown rock: walls, hills, worked stone. */
  stone: rgba(0x8a8578),
  /** Metal, sunlight and denarii. */
  bronze: rgba(0xa06a30),
  /** Blood, banners and Carthaginian cloth. */
  blood: rgba(0x9b2f22),
  /** Vegetation, cloth and the land at rest. */
  olive: rgba(0x6b7a3a),
} as const;

/** How many shades a standard ramp carries: dark enough to shade, light enough to highlight. */
export const RAMP_SHADES = 7;

/**
 * How far a ramp travels from its base, as a percentage of the way to black at
 * one end and to white at the other. Sixty is enough to read as a shade and not
 * so much that a ramp leaves its material behind.
 */
export const RAMP_SPREAD = 60;

/**
 * One base shifted toward black or toward white.
 *
 * The arithmetic is integer, and exact on every engine: darkening takes the
 * percentage of the channel there is, lightening takes the percentage of the
 * room left to 255. `-100` is black and `+100` is white for every colour, which
 * is what makes the ends of a ramp predictable rather than merely dark and
 * light.
 *
 * @param colour The base.
 * @param amount `0` is the base, negative darkens, positive lightens, `|amount| <= 100`.
 * @throws RangeError when the amount is not an integer in [-100, 100].
 */
export function shade(colour: Rgba, amount: number): Rgba {
  if (!Number.isInteger(amount) || amount < -100 || amount > 100) {
    throw new RangeError(`a shade amount must be an integer in [-100, 100], got ${String(amount)}`);
  }
  if (amount === 0) return colour;

  const mix = (channel: number): number =>
    amount < 0
      ? channel + Math.floor((channel * amount) / 100)
      : channel + Math.floor(((255 - channel) * amount) / 100);

  return [mix(colour[0]), mix(colour[1]), mix(colour[2]), colour[3]];
}

/**
 * The shades of one base, darkest first, with the base itself in the middle when
 * the ramp has an odd number of shades.
 *
 * @param base The colour the ramp is derived from.
 * @param shades How many shades to derive, at least one.
 * @throws RangeError when `shades` is not a positive integer.
 */
export function ramp(base: Rgba, shades: number = RAMP_SHADES): readonly Rgba[] {
  if (!Number.isInteger(shades) || shades < 1) {
    throw new RangeError(`a ramp needs a positive whole number of shades, got ${String(shades)}`);
  }
  if (shades === 1) return [base];

  const steps = shades - 1;
  return Array.from({ length: shades }, (_, index) =>
    shade(base, (((2 * index - steps) * RAMP_SPREAD) / steps) | 0),
  );
}

/**
 * One shade of a ramp, by index, darkest first.
 *
 * A generator picks its colours from a ramp — `shadeAt(RAMPS.stone, 2)` for a
 * shadow, `shadeAt(RAMPS.stone, 5)` for a lit face — so the lookup refuses an
 * index the ramp does not have rather than handing back a hole to draw with.
 *
 * @throws RangeError when the ramp has no such shade.
 */
export function shadeAt(ramp: readonly Rgba[], index: number): Rgba {
  const colour = ramp[index];
  if (colour === undefined) {
    throw new RangeError(`a ramp of ${String(ramp.length)} shades has no shade ${String(index)}`);
  }

  return colour;
}

/**
 * The ramps the catalogue draws from, one per material base.
 *
 * These are the shades a generator is expected to pick from: a stone wall takes
 * `RAMPS.stone[2]` for its shadow and `RAMPS.stone[5]` for its lit face, and the
 * Atelier renders every one of them so a ramp that reads badly is seen rather
 * than shipped.
 */
export const RAMPS = {
  stone: ramp(BASE.stone),
  bronze: ramp(BASE.bronze),
  blood: ramp(BASE.blood),
  olive: ramp(BASE.olive),
  parchment: ramp(BASE.parchment),
} as const;

/** The name of one of the derived ramps. */
export type RampName = keyof typeof RAMPS;

/** The ramps in the order a catalogue, a swatch strip or a test walks them. */
export const RAMP_NAMES: readonly RampName[] = ['stone', 'bronze', 'blood', 'olive', 'parchment'];
