import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  RESPONSIBILITIES,
  SAMPLES,
  SMOKE,
  VISUAL_SPECS,
  acceptanceSpecs,
  featureNames,
  featureSpecs,
} from '../../scripts/profiles.mjs';

/**
 * The verification inventory is only worth having if it cannot rot (ticket #64).
 *
 * These checks are about *attribution*, not about how a spec works: every
 * browser spec has an owner, complete acceptance reads the directory rather
 * than a hand list, the behaviors the ticket protects still have their owner,
 * the deliberately selected samples are still in their specs, and the frame
 * producers are all named. A test that mirrored implementation details would be
 * worthless here; a test that notices a spec nobody selected is the point.
 */
const E2E = fileURLToPath(new URL('../../e2e/', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const specNames = readdirSync(E2E).filter((name) => name.endsWith('.spec.ts'));
const allSpecs = acceptanceSpecs(specNames);
const ownerSpecs = [...SMOKE, ...Object.values(FEATURES).flat()];

describe('the browser responsibilities', () => {
  it('accept complete acceptance from the directory, not from a hand list', () => {
    expect(allSpecs).toEqual(specNames.map((name) => `e2e/${name}`).sort());
    expect(allSpecs.length).toBeGreaterThan(0);
  });

  it('give every spec an owner that a narrow profile can select', () => {
    const unowned = allSpecs.filter((spec) => !ownerSpecs.includes(spec));

    expect(unowned, 'a spec nobody owns is a spec no profile can run').toEqual([]);
  });

  it('name no spec twice inside one responsibility', () => {
    for (const [name, specs] of Object.entries(FEATURES)) {
      expect(new Set(specs).size, `${name} lists a spec twice`).toBe(specs.length);
    }
  });

  it('answer an unknown feature with undefined rather than a wider selection', () => {
    expect(featureSpecs('no-such-responsibility')).toBeUndefined();
    expect(featureNames()).toContain('orders');
  });
});

describe('the coverage map', () => {
  it('names an owner that exists for every protected behavior', () => {
    for (const { behavior, owners } of RESPONSIBILITIES) {
      expect(owners.length, `${behavior} has no owner`).toBeGreaterThan(0);
      for (const owner of owners) {
        expect(statSync(join(ROOT, owner)).isFile(), `${behavior}: ${owner} is missing`).toBe(true);
      }
    }
  });

  it('keeps every browser owner inside complete acceptance', () => {
    for (const { behavior, owners } of RESPONSIBILITIES) {
      for (const owner of owners.filter((path) => path.startsWith('e2e/'))) {
        expect(allSpecs, `${behavior}: ${owner} left complete acceptance`).toContain(owner);
      }
    }
  });

  it('keeps a deliberately selected sample in its responsibility', () => {
    for (const { feature, title } of SAMPLES) {
      const specs = featureSpecs(feature);
      expect(specs, `sample feature ${feature} is not a responsibility`).toBeDefined();

      const found = (specs ?? []).some((spec) => readFileSync(join(ROOT, spec), 'utf8').includes(title));
      expect(found, `${feature}: "${title}" is no longer selected by its profile`).toBe(true);
    }
  });
});

describe('the visual profile', () => {
  it('names only specs that exist and produce frames', () => {
    for (const spec of VISUAL_SPECS) {
      expect(statSync(join(ROOT, spec)).isFile(), `${spec} is missing`).toBe(true);
      expect(readFileSync(join(ROOT, spec), 'utf8'), `${spec} writes no frame`).toContain('capture(');
    }
  });

  it('leaves no frame producer unnamed', () => {
    const producers = allSpecs.filter((spec) => readFileSync(join(ROOT, spec), 'utf8').includes('capture(page,'));
    const unnamed = producers.filter((spec) => !VISUAL_SPECS.includes(spec));

    expect(unnamed, 'a spec producing frames outside the visual profile is not attributable').toEqual([]);
  });
});
