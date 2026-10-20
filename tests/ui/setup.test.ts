/**
 * The setup page (ticket U8, Q21).
 *
 * The page is bitmap, so "the explanation fits" is a geometry question before it
 * is a taste question: every line, every button and the help sentence have to be
 * inside the plate, no line may run through a button, and the button that starts
 * a Match must be disabled while the seed is invalid. The browser spec presses the
 * same rectangles and reads the accessible label; this suite holds the layout the
 * two of them share.
 */
import { describe, expect, it } from 'vitest';
import { setupLayout, type SetupModel } from '../../src/ui/match-menu.ts';
import type { Rect } from '../../src/ui/hud.ts';
import { translate } from '../../src/ui/strings.ts';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../../src/render/view.ts';

const SIZE = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };

const MODEL: SetupModel = {
  config: { seed: 59, faction: 'rome', difficulty: 'centurio' },
  proposed: 59,
  seedText: '',
  focus: 0,
  invalid: false,
};

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function overlaps(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width && right.x < left.x + left.width &&
    left.y < right.y + right.height && right.y < left.y + left.height;
}

describe('the setup page', () => {
  it('says the objective, both choices and how to work the page, in Italian', () => {
    const menu = setupLayout(SIZE, MODEL);
    const words = menu.texts.map((text) => text.text).join(' ');

    expect(words).toContain(translate('match.objective'));
    expect(words).toContain(translate('match.factionHelp'));
    expect(words).toContain(translate('match.difficultyHelp'));
    expect(words).toContain(translate('match.setupHelp'));
    expect(words).toContain(translate('match.seedHint').replace('{seed}', '59'));
    expect(menu.buttons.map((button) => button.text)).toEqual([
      `${translate('match.faction')}: ${translate('faction.rome')}`,
      `${translate('match.difficulty')}: ${translate('difficulty.centurio')}`,
      `${translate('match.seed')}: 59`,
      translate('match.start'),
    ]);
  });

  it('keeps every line and control inside the plate, and the lines clear of the controls', () => {
    const menu = setupLayout(SIZE, MODEL);

    for (const text of menu.texts) expect(inside(text.rect, menu.rect), text.text).toBe(true);
    for (const button of menu.buttons) expect(inside(button.rect, menu.rect), button.text).toBe(true);
    for (const text of menu.texts) {
      for (const button of menu.buttons) expect(overlaps(text.rect, button.rect), `${text.text} / ${button.text}`).toBe(false);
    }
    // A control is at least a glyph box and its air.
    for (const button of menu.buttons) expect(button.rect.height).toBeGreaterThanOrEqual(28);
  });

  it('offers all four choices, and disables Start only for an invalid seed', () => {
    const valid = setupLayout(SIZE, MODEL);
    expect(valid.buttons).toHaveLength(4);
    expect(valid.buttons[3]!.enabled).toBe(true);

    const invalid = setupLayout(SIZE, { ...MODEL, seedText: '4294967296', invalid: true });
    expect(invalid.buttons[3]!.enabled).toBe(false);
    expect(invalid.texts.map((text) => text.text).join(' ')).toContain(translate('match.invalidSeed'));
  });

  it('keeps the objective above the buttons when a long seed is typed', () => {
    const long = setupLayout(SIZE, { ...MODEL, seedText: '4294967295' });
    const objective = long.texts.findIndex((text) => text.text.startsWith('Obiettivo'));
    expect(objective).toBeGreaterThan(0);
    expect(long.texts[objective]!.rect.y).toBeLessThan(long.buttons[0]!.rect.y);
    for (const text of long.texts) expect(inside(text.rect, long.rect), text.text).toBe(true);
  });
});
