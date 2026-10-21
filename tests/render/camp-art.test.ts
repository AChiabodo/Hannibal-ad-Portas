import { expect, it } from 'vitest';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';
import { siteSprite } from '../../src/art/settlements';
import { siteLook } from '../../src/render/settlements';
import type { KnownSite } from '../../src/ui/sites';

it('draws a known Castrum but removes it and its ownership from memory', () => {
  const site: KnownSite = { id: 1, kind: 'settlement', x: 10, y: 10, owner: 'rome', memory: 'seen', front: null, camp: true };
  const camp = siteLook(site);
  const ordinary = siteLook({ ...site, camp: false });
  expect(hashPixelBuffer(siteSprite(camp))).not.toBe(hashPixelBuffer(siteSprite(ordinary)));
  expect(siteLook({ ...site, memory: 'remembered' }).camp).toBe(false);
  expect(siteLook({ ...site, memory: 'remembered' }).owner).toBe('none');
});
