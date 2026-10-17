import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, collectSourceFiles, toRepoPath } from './source-files.mjs';

/**
 * Where a fence starts: the simulation, and everything it can reach.
 *
 * Two fences need the same answer to "what can the simulation reach?" — the one
 * that bans the rendering engine and the one that bans arithmetic no engine
 * pins down — so the walk lives here once, and each fence decides what it is
 * looking for.
 */

/** The simulation root every reachability fence starts from. */
export const SIMULATION_ENTRY = 'src/sim';

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
 * @typedef {object} ReachableImport
 * @property {string} file Repository-relative path of the importing file.
 * @property {number} line 1-based.
 * @property {number} column 1-based.
 * @property {string} specifier Exactly what the source said.
 * @property {string | null | undefined} resolved Absolute path of the imported
 *   module, `null` for an asset import, `undefined` when the specifier is bare
 *   or nothing matched. Only relative specifiers are resolved.
 * @property {string[]} chain Repository-relative files from the entry to the
 *   importing file, the importing file last.
 */

/**
 * @typedef {object} ReachableSimulation
 * @property {string[]} files Absolute paths of every file reachable from the
 *   simulation, entry files included, sorted. Files with no imports of their
 *   own are here too: a leaf is still reachable.
 * @property {ReachableImport[]} imports Every import declared in those files,
 *   in the order the walk found them.
 * @property {Map<string, string[]>} chains Repository-relative file to the
 *   chain that reaches it, for naming how a fence was crossed.
 */

/**
 * Follows every module reachable from the simulation: the entry files first,
 * then whatever their relative imports reach.
 *
 * Bare specifiers are not followed, because the guard does not resolve
 * `node_modules`: the fence sees the simulation reaching a dependency through
 * repository code, but not what that dependency does inside.
 *
 * @param {string} root Repository root.
 * @returns {ReachableSimulation}
 */
export function reachableFromSimulation(root) {
  /** @type {string[]} */
  let entryFiles;
  try {
    entryFiles = collectSourceFiles(root, [SIMULATION_ENTRY]);
  } catch {
    throw new Error(`guard entry directory does not exist: ${SIMULATION_ENTRY}`);
  }
  if (entryFiles.length === 0) {
    throw new Error(`guard entry directory holds no source files: ${SIMULATION_ENTRY}`);
  }

  /** @type {ReachableImport[]} */
  const imports = [];
  /** @type {Set<string>} */
  const visited = new Set(entryFiles);
  /** @type {Map<string, string | null>} */
  const parentOf = new Map(entryFiles.map((file) => [file, null]));
  /** @type {Map<string, string[]>} */
  const chains = new Map(entryFiles.map((file) => [toRepoPath(root, file), [toRepoPath(root, file)]]));
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    const chain = chainTo(root, parentOf, file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

    for (const found of importsOf(source)) {
      const resolved = found.specifier.startsWith('.') ? resolveRelative(file, found.specifier) : undefined;
      imports.push({
        file: toRepoPath(root, file),
        line: found.line,
        column: found.column,
        specifier: found.specifier,
        resolved,
        chain,
      });

      if (typeof resolved !== 'string' || visited.has(resolved)) continue;

      visited.add(resolved);
      parentOf.set(resolved, file);
      chains.set(toRepoPath(root, resolved), chainTo(root, parentOf, resolved));
      queue.push(resolved);
    }
  }

  return { files: [...visited].sort(), imports, chains };
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
