import { expect, it } from 'vitest';
import { measureText } from '../../src/art/font.ts';
import { createTutorial, TUTORIAL_CHAPTERS } from '../../src/input/tutorial.ts';
import { entryMenu } from '../../src/ui/entry-menu.ts';
import { hudLayout, hudModel, wrapText } from '../../src/ui/hud.ts';
import { menuPlate, setupLayout } from '../../src/ui/match-menu.ts';
import { tutorialPanel } from '../../src/ui/tutorial.ts';

for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  it(`keeps entry, return and every chapter's instructions usable at ${size.width}`, () => {
    for (const chapters of [false, true]) {
      const menu = entryMenu(size, chapters, true);
      expect(() => menuPlate(size, menu, 2)).not.toThrow();
      for (const button of menu.buttons) {
        expect(button.rect.y + button.rect.height).toBeLessThanOrEqual(size.height);
        expect(button.rect.x).toBeGreaterThanOrEqual(0);
        expect(measureText(button.text, 2) + 24).toBeLessThanOrEqual(button.rect.width);
      }
    }
    const setup = setupLayout(size, { config: { seed: 0, faction: 'rome', difficulty: 'tiro' },
      seedText: 'invalid', proposed: 0, focus: 2, invalid: true }, true);
    for (const text of setup.texts) for (const button of setup.buttons) {
      expect(text.rect.y + text.rect.height <= button.rect.y || text.rect.y >= button.rect.y + button.rect.height).toBe(true);
    }
    for (const chapter of TUTORIAL_CHAPTERS) {
      const practice = createTutorial(chapter);
      for (let progress = 0; progress < (chapter === 'siege' ? 3 : 2); progress += 1) {
        const guide = tutorialPanel({ ...practice, progress });
        const model = hudModel(practice.host.observe(), [0, 1], null, [],
          { desktop: true, uiScale: 2, panelLayout: 'sidebar' }, { faction: 'rome', guide });
        const layout = hudLayout(model, size);
        const expected = guide.lines.flatMap((line) => wrapText(line, layout.guideText[1]!.rect.width / 2));
        expect(layout.guideText.slice(1).map(({ text }) => text)).toEqual(expected);
        for (const button of layout.guideButtons) {
          expect(button.rect.x + button.rect.width).toBeLessThanOrEqual(layout.guide.x + layout.guide.width);
        }
      }
    }
  });
}
