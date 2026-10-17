import { afterEach, describe, expect, it } from 'vitest';
import { findMathRandomViolations } from '../../scripts/guards/find-math-random.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function violationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findMathRandomViolations(tree.paths, { root: tree.root });
}

describe('findMathRandomViolations', () => {
  it('reports a call and names the file and line', () => {
    const violations = violationsOf({
      'src/sim/rng.ts': 'export function roll(): number {\n  return Math.random();\n}\n',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/sim/rng.ts', line: 2, column: 10 });
    expect(violations[0]?.message).toContain('Math.random');
  });

  it('accepts code that never touches the global generator', () => {
    const violations = violationsOf({
      'src/sim/rng.ts':
        'import { makeRng } from "./prng";\n\nexport function roll(rng: { next: () => number }) {\n  return rng.next();\n}\n',
    });

    expect(violations).toEqual([]);
  });

  it('does not fire on a comment or a string that merely mentions it', () => {
    const violations = violationsOf({
      'src/sim/notes.ts': '// Math.random is banned.\nexport const hint = "never call Math.random";\n',
    });

    expect(violations).toEqual([]);
  });

  it('catches the aliases that would otherwise slip past a plain search', () => {
    const violations = violationsOf({
      'src/sim/bracket.ts': 'const a = Math["random"]();\n',
      'src/sim/optional.ts': 'const b = Math?.random();\n',
      'src/sim/alias.ts': 'const { random } = Math;\n',
    });

    expect(violations.map((violation) => violation.file).sort()).toEqual([
      'src/sim/alias.ts',
      'src/sim/bracket.ts',
      'src/sim/optional.ts',
    ]);
  });

  it('reports every occurrence, not just the first', () => {
    const violations = violationsOf({
      'src/sim/two.ts': 'export const a = () => Math.random();\nexport const b = () => Math.random();\n',
    });

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.line)).toEqual([1, 2]);
  });

  it('ignores files whose type cannot hold JavaScript', () => {
    const violations = violationsOf({
      'src/sim/data.json': '{ "seed": "Math.random" }\n',
      'src/sim/notes.md': 'Math.random()\n',
    });

    expect(violations).toEqual([]);
  });
});
