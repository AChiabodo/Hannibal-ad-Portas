import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, toRepoPath } from './source-files.mjs';

/**
 * Finds the syntactic spellings of the operations a fence bans: the members of
 * one global object, and the one operator that is `Math.pow` without an object.
 *
 * The file is named for what it finds rather than for `Math`, which it no longer
 * assumes: `Math.random`, a transcendental and `Date.now` are the same kind of
 * violation — a spelling a rule may not use — and one walk reports them all.
 */

/**
 * The name the walk reports for exponentiation: the `**` operator and the `**=`
 * that is the same operation.
 *
 * `x ** y`, `x **= y` and `Math.pow(x, y)` are not three operations: `Math.pow`
 * step 3 is "Return Number::exponentiate(base, exponent)" (ECMA-262 §21.3.2.27),
 * which is exactly what both operators are sugar for, and that operation
 * "returns an implementation-approximated value" (§6.1.6.1.3). A fence that bans
 * `pow` and not the operators bans a spelling rather than the thing, so the walk
 * gives them this name — they belong to no object — and a fence bans them by
 * listing the name among its members.
 */
export const EXPONENTIATION = '**';

/**
 * The global objects a fence may name.
 *
 * A name outside this union is a fence scanning for a global that does not
 * exist: it finds nothing, reports zero violations, and never says so. Checking
 * the union turns that typo into a failure of `npm run check` instead of a
 * quietly green fence, and adding a global to it is a decision in review.
 *
 * @typedef {'Math' | 'crypto' | 'Date' | 'performance'} GlobalObject
 */

/**
 * Finds every syntactic path to an operation under one global object, or to the
 * one operator that is a member of `Math` in disguise.
 *
 * The three fences that ban nondeterministic spellings want the same walk with a
 * different object and a different list of names — the repository bans
 * `Math.random` everywhere (ADR-0006), the simulation bans the transcendentals
 * (PLAN §3), and it bans the ambient clock and entropy too — so the walk lives
 * here once and the fences decide what they are looking for. The object is a
 * parameter for the same reason: `Date.now()` is the same kind of violation as
 * `Math.random()`, and copying the walk to say so would be two walks to keep in
 * step.
 *
 * It is deliberately syntactic. It cannot see through an alias of a global
 * (`const M = Math; M.random()`), through `globalThis`, or through a member name
 * built at runtime (`Math['ran' + 'dom']()`), and it does not try to: a guard
 * that says what it cannot see beats one that quietly misses. The README repeats
 * that limit where a reader meets the green tick.
 *
 * @param {readonly string[]} files Absolute or root-relative file paths.
 * @param {{
 *   object: GlobalObject,
 *   members: readonly string[],
 *   message: (member: string) => string,
 *   root?: string,
 * }} options `object` is the global the members hang off; `members` are the
 *   names a fence bans, plus `EXPONENTIATION` for the fence that bans the
 *   operator.
 * @returns {import('./violations.mjs').Violation[]}
 */
export function findMemberViolations(files, options) {
  const root = options.root ?? process.cwd();
  const object = options.object;
  const members = new Set(options.members);

  /** @type {import('./violations.mjs').Violation[]} */
  const violations = [];

  for (const file of files) {
    if (!SOURCE_EXTENSIONS.includes(extname(file))) continue;

    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
    visit(source, source, file, { root, object, members, message: options.message, violations });
  }

  return violations;
}

/**
 * @param {ts.Node} node
 * @param {ts.SourceFile} source
 * @param {string} file
 * @param {{
 *   root: string,
 *   object: GlobalObject,
 *   members: Set<string>,
 *   message: (member: string) => string,
 *   violations: import('./violations.mjs').Violation[],
 * }} found
 */
function visit(node, source, file, found) {
  for (const member of membersTakenBy(node, found.object)) {
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
 * The members of the global one node takes: `Math.sin`, `Math["sin"]`,
 * `Math?.sin`, every name a destructuring pattern asks for, or `EXPONENTIATION`
 * for an operator that is `Math.pow` without saying so.
 *
 * @param {ts.Node} node
 * @param {GlobalObject} object
 * @returns {string[]}
 */
function membersTakenBy(node, object) {
  const accessed = memberOfGlobal(node, object);
  if (accessed !== undefined) return [accessed];

  const destructured = destructuredMembersOf(node, object);
  if (destructured.length > 0) return destructured;

  const operator = exponentiationOf(node);
  return operator === undefined ? [] : [operator];
}

/**
 * The name exponentiation reports, when the node is `**` or `**=`.
 *
 * `**=` is not a near miss to leave for later: it reaches the same
 * `Number::exponentiate` and differs only in where the result goes.
 *
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function exponentiationOf(node) {
  if (!ts.isBinaryExpression(node)) return undefined;

  const { kind } = node.operatorToken;
  const isExponentiation =
    kind === ts.SyntaxKind.AsteriskAsteriskToken || kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken;

  return isExponentiation ? EXPONENTIATION : undefined;
}

/**
 * The member name of `Math.sin`, `Math["sin"]` or `Math?.sin`, when the node is
 * one of those.
 *
 * @param {ts.Node} node
 * @param {GlobalObject} object
 * @returns {string | undefined}
 */
function memberOfGlobal(node, object) {
  if (ts.isPropertyAccessExpression(node)) {
    return isGlobalIdentifier(node.expression, object) ? node.name.text : undefined;
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (
      !isGlobalIdentifier(node.expression, object) ||
      argument === undefined ||
      !ts.isStringLiteral(argument)
    ) {
      return undefined;
    }

    return argument.text;
  }

  return undefined;
}

/**
 * The members a destructuring pattern takes from the global: `const { sin, cos } = Math`.
 *
 * @param {ts.Node} node
 * @param {GlobalObject} object
 * @returns {string[]}
 */
function destructuredMembersOf(node, object) {
  if (!ts.isVariableDeclaration(node)) return [];
  if (node.initializer === undefined || !isGlobalIdentifier(node.initializer, object)) return [];
  if (!ts.isObjectBindingPattern(node.name)) return [];

  return node.name.elements.map((element) =>
    (element.propertyName ?? element.name).getText().replace(/['"]/g, ''),
  );
}

/**
 * @param {ts.Node} node
 * @param {GlobalObject} object
 * @returns {boolean}
 */
function isGlobalIdentifier(node, object) {
  return ts.isIdentifier(node) && node.text === object;
}
