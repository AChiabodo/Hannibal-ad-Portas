import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, collectSourceFiles, toRepoPath } from './source-files.mjs';

/**
 * Fence #1: the simulation must never be able to reach the rendering engine
 * (ADR-0001, PLAN §3). The check is on *reachability*, not on direct imports,
 * so `sim → art → pixi.js` fails just as loudly as `sim → pixi.js`.
 */

/** @typedef {import('./violations.mjs').Violation} Violation */

/** The simulation root the fence starts from. */
export const SIMULATION_ENTRY = 'src/sim';

/** The rendering engine the simulation must never reach. */
export const RENDERER_PACKAGE = 'pixi.js';

/** Extensions that are assets rather than code, and are therefore not followed. */
const ASSET_EXTENSIONS = new Set(['.css', '.json', '.html', '.svg', '.wasm', '.png', '.txt']);

/**
 * TypeScript lets a module import its neighbour by the JavaScript extension it
 * will have once compiled, so `./map.js` has to be read as `./map.ts` too.
 * Missing that would report a resolver the guard simply failed to follow.
 */
const JAVASCRIPT_TO_TYPESCRIPT = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
]);

/**
 * @param {string} specifier
 * @returns {string}
 */
const message = (specifier) =>
  `imports "${specifier}" — ${RENDERER_PACKAGE} must never be reachable from the simulation (ADR-0001)`;

/**
 * Follows every module reachable from `SIMULATION_ENTRY` and reports each
 * import of `RENDERER_PACKAGE`, with the chain that reaches it.
 *
 * Bare specifiers other than the renderer are not followed: the guard does not
 * resolve `node_modules`, so it sees the simulation reaching the engine
 * directly or through repository code, but not through a dependency.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findRendererReachableFromSimulation(root) {
  const entry = SIMULATION_ENTRY;
  const forbidden = RENDERER_PACKAGE;

  /** @type {string[]} */
  let entryFiles;
  try {
    entryFiles = collectSourceFiles(root, [entry]);
  } catch {
    throw new Error(`guard entry directory does not exist: ${entry}`);
  }
  if (entryFiles.length === 0) {
    throw new Error(`guard entry directory holds no source files: ${entry}`);
  }

  /** @type {Violation[]} */
  const violations = [];
  /** @type {Set<string>} */
  const visited = new Set(entryFiles);
  /** @type {Map<string, string | null>} */
  const parentOf = new Map(entryFiles.map((file) => [file, null]));
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

    for (const found of importsOf(source)) {
      const at = { file: toRepoPath(root, file), line: found.line, column: found.column };

      if (isForbidden(found.specifier, forbidden)) {
        violations.push({
          ...at,
          message: message(found.specifier),
          chain: [...chainTo(root, parentOf, file), found.specifier],
        });
        continue;
      }

      if (!found.specifier.startsWith('.')) continue;

      const resolved = resolveRelative(file, found.specifier);
      if (resolved === null) continue;

      if (resolved === undefined) {
        violations.push({
          ...at,
          message: `imports "${found.specifier}" — the guard cannot resolve it, so it cannot see through it`,
          chain: [...chainTo(root, parentOf, file), found.specifier],
        });
        continue;
      }

      if (!visited.has(resolved)) {
        visited.add(resolved);
        parentOf.set(resolved, file);
        queue.push(resolved);
      }
    }
  }

  return violations;
}

/**
 * @param {string} specifier
 * @param {string} forbidden
 * @returns {boolean}
 */
function isForbidden(specifier, forbidden) {
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`);
}

/**
 * Resolves a relative specifier within the repository.
 *
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | undefined | null} A path, `null` for an asset import, `undefined` when nothing matched.
 */
function resolveRelative(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  const extension = extname(base);

  if (SOURCE_EXTENSIONS.includes(extension)) {
    if (isFile(base)) return base;

    for (const alternative of JAVASCRIPT_TO_TYPESCRIPT.get(extension) ?? []) {
      const swapped = base.slice(0, -extension.length) + alternative;
      if (isFile(swapped)) return swapped;
    }

    return undefined;
  }
  if (ASSET_EXTENSIONS.has(extension)) {
    return null;
  }

  for (const candidate of SOURCE_EXTENSIONS) {
    if (isFile(base + candidate)) return base + candidate;
  }
  for (const candidate of SOURCE_EXTENSIONS) {
    const index = join(base, `index${candidate}`);
    if (isFile(index)) return index;
  }

  return undefined;
}

/** @param {string} path @returns {boolean} */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Every import-like specifier in a file: static imports, re-exports, dynamic
 * `import()` and `require()`, type-only or not.
 *
 * @param {ts.SourceFile} source
 * @returns {{ specifier: string, line: number, column: number }[]}
 */
function importsOf(source) {
  /** @type {{ specifier: string, line: number, column: number }[]} */
  const found = [];

  /**
   * @param {ts.Node} node
   * @param {string} specifier
   */
  const record = (node, specifier) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ specifier, line: line + 1, column: character + 1 });
  };

  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node, node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && isImportOrRequire(node)) {
      const [first] = node.arguments;
      if (first !== undefined && ts.isStringLiteral(first)) record(node, first.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

/**
 * @param {ts.CallExpression} node
 * @returns {boolean}
 */
function isImportOrRequire(node) {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return ts.isIdentifier(node.expression) && node.expression.text === 'require';
}

/**
 * @param {string} root
 * @param {Map<string, string | null>} parentOf
 * @param {string} file
 * @returns {string[]}
 */
function chainTo(root, parentOf, file) {
  /** @type {string[]} */
  const chain = [];
  /** @type {string | null | undefined} */
  let current = file;

  while (current !== null && current !== undefined) {
    chain.unshift(toRepoPath(root, current));
    current = parentOf.get(current);
  }

  return chain;
}
