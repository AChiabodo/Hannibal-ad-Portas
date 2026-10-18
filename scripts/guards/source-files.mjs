import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import ts from 'typescript';

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
  'artifacts',
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
  return collectFiles(root, directories, (name) => SOURCE_EXTENSION_SET.has(extname(name)));
}

/**
 * Collects every readable file under the given root-relative directories,
 * source or not, sorted, as absolute paths.
 *
 * The asset fence needs to see a `.png` to report it, which is the one thing a
 * walk that keeps only source extensions cannot do. Everything else about the
 * walk — the ignore list, the refusal of a missing root — is the same, so it is
 * the same walk with a different question asked of each name.
 *
 * @param {string} root Repository root.
 * @param {readonly string[]} directories Root-relative directories to walk.
 * @returns {string[]}
 */
export function collectAllFiles(root, directories) {
  return collectFiles(root, directories, () => true);
}

/**
 * The walk both collectors share: recursion, the ignore list, and the sorted
 * result. `keep` decides what each file name is.
 *
 * @param {string} root Repository root.
 * @param {readonly string[]} directories Root-relative directories to walk.
 * @param {(name: string) => boolean} keep
 * @returns {string[]}
 */
function collectFiles(root, directories, keep) {
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
    walk(path, files, keep);
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
 * Every import-like specifier in a parsed file: static imports, re-exports,
 * dynamic `import()` and `require()`, type-only or not.
 *
 * It lives with the rest of the source-file plumbing because more than one
 * fence reads imports and none of them owns "what an import looks like".
 *
 * @param {ts.SourceFile} source
 * @returns {{ specifier: string, line: number, column: number }[]}
 */
export function importsOf(source) {
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
 * @param {string} directory
 * @param {string[]} files
 * @param {(name: string) => boolean} keep
 */
function walk(directory, files, keep) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walk(path, files, keep);
    } else if (entry.isFile() && keep(entry.name)) {
      files.push(path);
    }
  }
}
