import { expect, it } from 'vitest';
import { measureText } from '../../src/art/font.ts';
import { setupLayout } from '../../src/ui/match-menu.ts';

it('gives setup explanations readable glyphs and keeps invalid-seed help clear of controls', () => {
  for (const invalid of [false, true]) {
    const menu = setupLayout({ width: 640, height: 480 }, {
      config: { faction: 'carthage', difficulty: 'imperator', seed: 4294967295 },
      proposed: 4294967295, seedText: invalid ? 'invalid' : '', focus: 2, invalid,
    });
    for (const line of menu.texts) {
      expect(line.scale).toBeGreaterThanOrEqual(2);
      expect(line.rect.x + measureText(line.text, line.scale)).toBeLessThanOrEqual(menu.rect.x + menu.rect.width);
      expect(line.rect.y + line.rect.height).toBeLessThanOrEqual(menu.rect.y + menu.rect.height);
      for (const button of menu.buttons) {
        expect(line.rect.y + line.rect.height <= button.rect.y || line.rect.y >= button.rect.y + button.rect.height).toBe(true);
      }
    }
  }
});
