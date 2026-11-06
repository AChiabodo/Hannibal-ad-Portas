import { readFileSync, realpathSync } from 'node:fs';
import ts from 'typescript';
import { collectSourceFiles, toRepoPath } from './source-files.mjs';
import { existingSimulationEntries, resolveRelative } from './sim-reachability.mjs';

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * The AI and every local helper it reaches may cross into sim/ only through a
 * type-only named Observation import. That permitted edge is terminal: the
 * Observation's own declaration dependencies belong to the simulation.
 * Bare, unresolved and computed imports fail closed; no package is inspected.
 * Like the other fences this reads syntax, not eval or generated source.
 *
 * @param {string} root
 * @returns {Violation[]}
 */
export function findAiSimulationImports(root) {
  if (!existingSimulationEntries(root).includes('src/ai')) return [];
  const files = collectSourceFiles(root, ['src/ai']);
  const queue = files.map((file) => ({ file, chain: [toRepoPath(root, file)] }));
  const visited = new Set(files);
  /** @type {Violation[]} */
  const violations = [];

  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    if (entry === undefined) continue;
    const { file, chain } = entry;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

    /** @param {ts.Node} node @param {string | undefined} specifier @param {boolean} observationType */
    const inspect = (node, specifier, observationType) => {
      const found = specifier?.startsWith('.') ? resolveRelative(file, specifier) : undefined;
      // Resolve the actual file, including Windows case and local symlink aliases.
      const resolved = typeof found === 'string' ? realpathSync(found) : found;
      const target = typeof resolved === 'string' ? toRepoPath(root, resolved) : undefined;
      const boundaryTarget = target?.toLowerCase();
      if (boundaryTarget === 'src/sim/observation.ts' && observationType) return;

      if (target === undefined || boundaryTarget?.startsWith('src/sim/')) {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push({
          file: toRepoPath(root, file), line: line + 1, column: character + 1,
          message: `imports "${specifier ?? '<computed>'}" — AI may import only Observation types from sim/; unresolved modules are refused`,
          chain: [...chain, specifier ?? '<computed>'],
        });
        return;
      }
      if (typeof resolved === 'string' && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push({ file: resolved, chain: [...chain, target] });
      }
    };

    /** @param {ts.Node} node */
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const allowed = clause !== undefined && clause.name === undefined && bindings !== undefined &&
          ts.isNamedImports(bindings) && bindings.elements.length > 0 &&
          bindings.elements.every((item) => (clause.isTypeOnly || item.isTypeOnly) &&
            (item.propertyName ?? item.name).text === 'Observation');
        inspect(node, node.moduleSpecifier.text, allowed);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
        const allowed = node.exportClause !== undefined && ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 && node.exportClause.elements.every((item) =>
            (node.isTypeOnly || item.isTypeOnly) && (item.propertyName ?? item.name).text === 'Observation');
        inspect(node, node.moduleSpecifier.text, allowed);
      } else if (ts.isImportTypeNode(node)) {
        const specifier = ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
          ? node.argument.literal.text : undefined;
        inspect(node, specifier, !node.isTypeOf && node.qualifier !== undefined &&
          ts.isIdentifier(node.qualifier) && node.qualifier.text === 'Observation');
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const first = node.arguments[0];
        inspect(node, first !== undefined && ts.isStringLiteral(first) ? first.text : undefined, false);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        inspect(node, expression !== undefined && ts.isStringLiteral(expression) ? expression.text : undefined, false);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations;
}
