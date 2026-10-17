import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

/** Human-readable source extensions. Anything else is an asset, not code. */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * What `npm run guard` scans for the Math.random fence: the whole repository.
 * Listing directories instead would leave a hole for the next top-level folder,
 * and the rule is "nothing anywhere". CI and the tests that check the real
 * repository share this one definition.
 */
export const GUARDED_ROOTS = ['.'];

const SOURCE_EXTENSION_SET = new Set(SOURCE_EXTENSIONS);

/** Directories that hold dependencies, generated output or agent configuration. */
const IGNORED_DIRECTORIES = new Set([
  '.agents',
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

/**
 * Collects every readable source file under the given root-relative
 * directories, sorted, as absolute paths. `'.'` means the whole repository.
 *
 * A configured directory that is missing is an error: a guard that quietly
 * scans nothing is worse than no guard at all.
 *
 * @param {string} root Repository root.
 * @param {readonly string[]} directories Root-relative directories to walk.
 * @returns {string[]}
 */
export function collectSourceFiles(root, directories) {
  /** @type {string[]} */
  const files = [];

  for (const directory of directories) {
    // The ignore list is a fence, not a convention: generated output and
    // dependencies are never scanned even when a caller asks for them.
    if (IGNORED_DIRECTORIES.has(basename(directory))) continue;

    const path = join(root, directory);
    /** @type {import('node:fs').Stats} */
    let stats;
    try {
      stats = statSync(path);
    } catch {
      throw new Error(`guard scan root does not exist: ${directory}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`guard scan root is not a directory: ${directory}`);
    }
    walk(path, files);
  }

  return files.sort();
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {string} Repository-relative path with POSIX separators.
 */
export function toRepoPath(root, file) {
  return relative(root, file).split(sep).join('/');
}

/**
 * @param {string} directory
 * @param {string[]} files
 */
function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walk(path, files);
    } else if (entry.isFile() && SOURCE_EXTENSION_SET.has(extname(entry.name))) {
      files.push(path);
    }
  }
}
