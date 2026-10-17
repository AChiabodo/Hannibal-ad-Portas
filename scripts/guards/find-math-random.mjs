import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, toRepoPath } from './source-files.mjs';

/** Fence #2: the repository bans the global generator (ADR-0006, PLAN §3). */
export const MATH_RANDOM_MESSAGE =
  'reaches Math.random — use the seeded PRNG (xmur3 seeded sfc32), never the global generator: docs/PLAN.md §3';

const FORBIDDEN_MEMBER = 'random';

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * Finds every syntactic path to the global generator: `Math.random()`,
 * `Math["random"]()`, `Math?.random()` and `const { random } = Math`.
 *
 * It is deliberately syntactic. It cannot see through a computed member name or
 * a re-exported alias of the global `Math`, and it does not try to.
 *
 * @param {readonly string[]} files Absolute or root-relative file paths.
 * @param {{ root?: string }} [options] Root used to shorten reported paths.
 * @returns {Violation[]}
 */
export function findMathRandomViolations(files, options = {}) {
  const root = options.root ?? process.cwd();
  /** @type {Violation[]} */
  const violations = [];

  for (const file of files) {
    if (!SOURCE_EXTENSIONS.includes(extname(file))) continue;

    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
    visit(source, source, file, root, violations);
  }

  return violations;
}

/**
 * @param {ts.Node} node
 * @param {ts.SourceFile} source
 * @param {string} file
 * @param {string} root
 * @param {Violation[]} violations
 */
function visit(node, source, file, root, violations) {
  const position = node.getStart(source);
  const { line, character } = source.getLineAndCharacterOfPosition(position);

  if (isMathRandomAccess(node) || isMathRandomDestructuring(node)) {
    violations.push({
      file: toRepoPath(root, file),
      line: line + 1,
      column: character + 1,
      message: MATH_RANDOM_MESSAGE,
    });
  }

  ts.forEachChild(node, (child) => visit(child, source, file, root, violations));
}

/**
 * `Math.random`, `Math["random"]`, `Math?.random`.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isMathRandomAccess(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return isMathIdentifier(node.expression) && node.name.text === FORBIDDEN_MEMBER;
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return (
      isMathIdentifier(node.expression) &&
      argument !== undefined &&
      ts.isStringLiteral(argument) &&
      argument.text === FORBIDDEN_MEMBER
    );
  }

  return false;
}

/** `const { random } = Math`. @param {ts.Node} node @returns {boolean} */
function isMathRandomDestructuring(node) {
  if (!ts.isVariableDeclaration(node)) return false;
  if (node.initializer === undefined || !isMathIdentifier(node.initializer)) return false;
  if (!ts.isObjectBindingPattern(node.name)) return false;

  return node.name.elements.some(
    (element) => (element.propertyName ?? element.name).getText().replace(/['"]/g, '') === FORBIDDEN_MEMBER,
  );
}

/** @param {ts.Node} node @returns {boolean} */
function isMathIdentifier(node) {
  return ts.isIdentifier(node) && node.text === 'Math';
}
