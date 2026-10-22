import { describe, expect, it } from 'vitest';
import { measureText } from '../../src/art/font';
import { encyclopediaLayout, openReference, referenceAction } from '../../src/ui/encyclopedia';
import { REFERENCE_ENTRIES } from '../../src/ui/reference';

describe('the reusable Encyclopedia surface', () => {
  it('distinguishes topic navigation from article pages and counts the visible topics', () => {
    const layout = encyclopediaLayout({ width: 1280, height: 720 }, openReference('treasury'));
    expect(layout.text.map((line) => line.text)).toContain('Voci 1-5/10');
    expect(layout.controls.find((control) => control.id === 'navNext')?.text).toBe('Altre voci');
    expect(layout.controls.find((control) => control.id === 'next')?.text).toBe('Pagina dopo');
  });

  it('turns article pages without repeating the preceding page at the tail', () => {
    const size = { width: 1280, height: 720 };
    const state = openReference();
    const first = encyclopediaLayout(size, state);
    const second = encyclopediaLayout(size, referenceAction(state, 'next', first));
    expect(second.offset).toBe(first.page);
    expect(second.text.map((line) => line.text)).toContain('Pagina 2/2');
  });

  it('opens with practical first steps and lets readers browse one subject at a time', () => {
    const size = { width: 1280, height: 720 };
    const first = encyclopediaLayout(size, openReference());
    expect(first.entry.id).toBe('first-steps');
    expect(first.controls.filter((control) => control.id.startsWith('section:')).map((control) => control.text))
      .toEqual(['Primi passi', 'Economia', 'Edifici', 'Esercito', 'Guerra e territorio']);
    const buildings = encyclopediaLayout(size, referenceAction(openReference(), 'section:buildings', first));
    const entries = buildings.controls.filter((control) => control.id.startsWith('entry:'));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((control) => control.id.startsWith('entry:building:'))).toBe(true);
    const context = encyclopediaLayout(size, openReference('building:forum'));
    expect(context.controls.find((control) => control.id === 'section:buildings')?.selected).toBe(true);
    expect(context.controls.find((control) => control.id === 'entry:building:forum')).toBeDefined();
  });
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    it(`keeps every entry, long paragraph and return reachable at ${size.width}`, () => {
      for (const entry of REFERENCE_ENTRIES) {
        let state = openReference(entry.id);
        const visited = new Set<number>();
        for (;;) {
          const layout = encyclopediaLayout(size, state);
          expect(layout.entry.id).toBe(entry.id);
          expect(layout.controls.some((control) => control.id === 'close' && control.enabled)).toBe(true);
          expect(layout.controls.some((control) => control.id === `entry:${entry.id}`)).toBe(true);
          for (const { text, rect } of layout.text) {
            expect(measureText(text, 2), entry.id).toBeLessThanOrEqual(rect.width);
            expect(rect.y + rect.height, entry.id).toBeLessThanOrEqual(size.height);
          }
          for (const { rect } of layout.controls) {
            expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
            expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
            expect(rect.height).toBeGreaterThanOrEqual(36);
          }
          for (const control of layout.controls) {
            expect(measureText(control.text, 2), `clipped control: ${control.id}`).toBeLessThanOrEqual(control.rect.width - 16);
          }
          expect(visited.has(layout.offset), `unreachable tail of ${entry.id}`).toBe(false);
          visited.add(layout.offset);
          if (layout.offset === layout.max) break;
          state = referenceAction(state, 'next', layout);
        }
      }
    });
  }

  it('rejects broken contextual links and lets navigation return to an earlier entry', () => {
    expect(() => openReference('building:missing')).toThrow(RangeError);
    const size = { width: 1280, height: 720 };
    const state = openReference('building:forum');
    const layout = encyclopediaLayout(size, state);
    const next = referenceAction(state, 'entry:labour', layout);
    expect(encyclopediaLayout(size, next).entry.id).toBe('labour');
  });
});
