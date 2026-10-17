import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, toRepoPath } from './source-files.mjs';

/**
 * Finds every syntactic path to a member of the global `Math`.
 *
 * Both `Math` fences want the same walk with a different list of names — the
 * repository bans `Math.random` everywhere (ADR-0006) and the simulation bans
 * the transcendentals (PLAN §3) — so the walk lives here once and the fences
 * decide which names they are looking for.
 *
 * It is deliberately syntactic. It cannot see through a computed member name or
 * an alias of the global `Math`, and it does not try to: a guard that says what
 * it cannot see beats one that quietly misses.
 *
 * @param {readonly string[]} files Absolute or root-relative file paths.
 * @param {{ members: readonly string[], message: (member: string) => string, root?: string }} options
 * @returns {import('./violations.mjs').Violation[]}
 */
export function findMathMemberViolations(files, options) {
  const root = options.root ?? process.cwd();
  const members = new Set(options.members);

  /** @type {import('./violations.mjs').Violation[]} */
  const violations = [];

  for (const file of files) {
    if (!SOURCE_EXTENSIONS.includes(extname(file))) continue;

    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
    visit(source, source, file, { root, members, message: options.message, violations });
  }

  return violations;
}

/**
 * @param {ts.Node} node
 * @param {ts.SourceFile} source
 * @param {string} file
 * @param {{ root: string, members: Set<string>, message: (member: string) => string, violations: import('./violations.mjs').Violation[] }} found
 */
function visit(node, source, file, found) {
  for (const member of mathMembersTakenBy(node)) {
    if (!found.members.has(member)) continue;

    const position = node.getStart(source);
    const { line, character } = source.getLineAndCharacterOfPosition(position);
    found.violations.push({
      file: toRepoPath(found.root, file),
      line: line + 1,
      column: character + 1,
      message: found.message(member),
    });
  }

  ts.forEachChild(node, (child) => visit(child, source, file, found));
}

/**
 * The `Math` members one node takes: `Math.sin`, `Math["sin"]`, `Math?.sin`, or
 * every name a destructuring pattern asks for.
 *
 * @param {ts.Node} node
 * @returns {string[]}
 */
function mathMembersTakenBy(node) {
  const accessed = mathMemberOf(node);
  return accessed === undefined ? destructuredMembersOf(node) : [accessed];
}

/**
 * The member name of `Math.sin`, `Math["sin"]` or `Math?.sin`, when the node is
 * one of those.
 *
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function mathMemberOf(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return isMathIdentifier(node.expression) ? node.name.text : undefined;
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (!isMathIdentifier(node.expression) || argument === undefined || !ts.isStringLiteral(argument)) {
      return undefined;
    }

    return argument.text;
  }

  return undefined;
}

/**
 * The `Math` members a destructuring pattern takes: `const { sin, cos } = Math`.
 *
 * @param {ts.Node} node
 * @returns {string[]}
 */
function destructuredMembersOf(node) {
  if (!ts.isVariableDeclaration(node)) return [];
  if (node.initializer === undefined || !isMathIdentifier(node.initializer)) return [];
  if (!ts.isObjectBindingPattern(node.name)) return [];

  return node.name.elements.map((element) =>
    (element.propertyName ?? element.name).getText().replace(/['"]/g, ''),
  );
}

/** @param {ts.Node} node @returns {boolean} */
function isMathIdentifier(node) {
  return ts.isIdentifier(node) && node.text === 'Math';
}
