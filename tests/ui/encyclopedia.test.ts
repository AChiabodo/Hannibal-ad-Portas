import { describe, expect, it } from 'vitest';
import { measureText } from '../../src/art/font';
import { encyclopediaLayout, openReference, referenceAction } from '../../src/ui/encyclopedia';
import { REFERENCE_ENTRIES } from '../../src/ui/reference';

describe('the reusable Encyclopedia surface', () => {
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
