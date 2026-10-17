import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A throwaway directory tree standing in for the repository. */
export type FixtureTree = {
  /** Absolute path of the fixture repository root. */
  readonly root: string;
  /** Absolute paths of the written files, in insertion order. */
  readonly paths: readonly string[];
  /** Deletes the whole tree. */
  remove: () => void;
};

/**
 * Writes a tree of files under a fresh temporary directory. Keys are
 * repository-relative paths, values are file contents.
 */
export function makeTree(files: Record<string, string>): FixtureTree {
  const root = mkdtempSync(join(tmpdir(), 'spqr-guard-'));
  const paths: string[] = [];

  for (const [relative, contents] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
    paths.push(path);
  }

  return {
    root,
    paths,
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
