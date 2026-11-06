import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import ts from 'typescript';
import { SOURCE_EXTENSIONS, collectSourceFiles, importsOf, toRepoPath } from './source-files.mjs';

/**
 * Where a fence starts: the simulation, and everything it can reach.
 *
 * Both reachability fences need the same answer to "what can the simulation
 * reach?" — the one that bans the rendering engine and the one that bans
 * arithmetic no engine pins down — so the walk lives here once, and each fence
 * decides what it is looking for.
 */

/**
 * The simulation's roots, in walk order.
 *
 * `src/sim` is the Match itself. `src/ai` and `src/content` are the other two
 * directories ADR-0001 and PLAN §3 count as the simulation. The directory list
 * tolerates absent optional roots in fixture repositories, while this working
 * tree fences all three. PLAN §3's module boundary is unchanged: `ai/` lives
 * beside `sim/` and may reach only an Observation's types; the fence starts
 * there without moving the AI under `sim/`.
 */
export const SIMULATION_ENTRIES = ['src/sim', 'src/ai', 'src/content'];

/**
 * The one root that must exist: without the Match there is no simulation to
 * fence, and a guard that quietly scanned nothing would be worse than none.
 */
export const REQUIRED_SIMULATION_ENTRY = 'src/sim';

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
 * The simulation roots that exist on disk, in `SIMULATION_ENTRIES` order.
 *
 * Absent roots are tolerated on purpose (see `SIMULATION_ENTRIES`). The guard
 * CLI prints this list too, so it can name the roots it actually walked.
 *
 * @param {string} root Repository root.
 * @returns {string[]}
 */
export function existingSimulationEntries(root) {
  return SIMULATION_ENTRIES.filter((entry) => isDirectory(root, entry));
}

/**
 * Whether a simulation root is there and is a directory.
 *
 * Only `ENOENT` — a missing optional root in a fixture repository — is false.
 * A path that exists but is a file, or that cannot
 * be read, is an error rather than a root that is merely absent: the guard must
 * not mistake either for a missing optional root and quietly leave it unfenced.
 * `collectSourceFiles` takes the same stance for a missing scan root.
 *
 * @param {string} root Repository root.
 * @param {string} entry Root-relative simulation root.
 * @returns {boolean}
 */
function isDirectory(root, entry) {
  /** @type {import('node:fs').Stats} */
  let stats;
  try {
    stats = statSync(join(root, entry));
  } catch (error) {
    if (isMissing(error)) return false;
    throw new Error(
      `guard entry cannot be read: ${entry} (${error instanceof Error ? error.message : String(error)})`,
      { cause: error },
    );
  }
  if (!stats.isDirectory()) {
    throw new Error(`guard entry is not a directory: ${entry}`);
  }
  return true;
}

/**
 * Whether an error means "this path is not there", and only that.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissing(error) {
  return error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT';
}

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
  const entries = existingSimulationEntries(root);
  if (!entries.includes(REQUIRED_SIMULATION_ENTRY)) {
    throw new Error(`guard entry directory does not exist: ${REQUIRED_SIMULATION_ENTRY}`);
  }

  /** @type {string[]} */
  const entryFiles = entries.flatMap((entry) => collectSourceFiles(root, [entry]));
  if (entryFiles.length === 0) {
    throw new Error(`guard entry directory holds no source files: ${REQUIRED_SIMULATION_ENTRY}`);
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
export function resolveRelative(fromFile, specifier) {
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
