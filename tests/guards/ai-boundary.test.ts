import { afterEach, describe, expect, it } from 'vitest';
import { findAiSimulationImports } from '../../scripts/guards/ai-boundary.mjs';
import { makeTree, type FixtureTree } from './make-tree.ts';

let tree: FixtureTree | undefined;
afterEach(() => { tree?.remove(); tree = undefined; });

function guard(files: Record<string, string>) {
  tree = makeTree({ 'src/sim/state.ts': 'export const secret = 42;', ...files });
  return findAiSimulationImports(tree.root);
}

describe('the AI Observation import fence', () => {
  it('refuses a runtime import of simulation internals and names the chain', () => {
    const violations = guard({ 'src/ai/brain.ts': "import { secret } from '../sim/state.ts';" });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'src/ai/brain.ts', line: 1,
      chain: ['src/ai/brain.ts', '../sim/state.ts'],
    });
  });

  it.each([
    "import type { MatchState } from '../sim/state.ts';",
    "import type { MatchState } from '../SIM/state.ts';",
    "export type { MatchState as Observation } from '../sim/state.ts';",
    "import { Observation } from '../sim/observation.ts';",
    "import type * as World from '../sim/state.ts';",
    "import '../sim/observation.ts';",
    "export * from '../sim/state.ts';",
    "const world = import('../sim/state.ts');",
    "const world = require('../sim/state.ts');",
    "import world = require('../sim/state.ts');",
    "type Secret = import('../sim/state.ts').MatchState;",
    "type Secret = typeof import('../sim/observation.ts');",
    "const world = import(path);",
    "import { readFileSync } from 'node:fs';",
  ])('closes the alternate import spelling %s', (source) => {
    expect(guard({
      'src/ai/brain.ts': source,
      'src/sim/observation.ts': 'export interface Observation<V> { visible: V }',
    })).toHaveLength(1);
  });

  it('follows a helper and a type barrel to the forbidden import', () => {
    const violations = guard({
      'src/ai/brain.ts': "import type { Hidden } from '../shared/helper.ts';",
      'src/shared/helper.ts': "export type { Hidden } from './barrel.ts';",
      'src/shared/barrel.ts': "export type { MatchState as Hidden } from '../sim/state.ts';",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.chain).toEqual([
      'src/ai/brain.ts', 'src/shared/helper.ts', 'src/shared/barrel.ts', '../sim/state.ts',
    ]);
  });

  it.each([
    "import type { Observation as Seen } from '../sim/observation.ts';",
    "import { type Observation } from '../sim/observation.ts';",
    "export type { Observation } from '../sim/observation.ts';",
    "type Seen = import('../sim/observation.ts').Observation<unknown>;",
  ])('allows Observation types without walking into their declaration dependencies: %s', (source) => {
    expect(guard({
      'src/ai/brain.ts': source,
      'src/sim/observation.ts': "import type { Faction } from './state.ts'; export interface Observation<V> { visible: V }",
    })).toEqual([]);
  });

  it('follows local modules through cycles, and refuses an unresolved import', () => {
    expect(guard({
      'src/ai/brain.ts': "export { decide } from './helper.ts';",
      'src/ai/helper.ts': "import './brain.ts'; import '../missing.ts'; export const decide = () => [];",
    })).toHaveLength(1);
  });
});
