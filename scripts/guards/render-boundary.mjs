import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { GUARDED_ROOTS, collectSourceFiles, importsOf, toRepoPath } from './source-files.mjs';
import { RENDERER_PACKAGE, isRendererImport } from './renderer.mjs';

/**
 * Fence: `pixi.js` outside the two places a real browser runs it (PLAN §3, ADR-0001).
 *
 * The reachability fence beside this one answers "what can the simulation
 * reach"; this one answers "may this file import the rendering engine at all".
 * They must stay attributable — a `pixi.js` in `src/main.ts` is not the
 * simulation reaching the engine, and reporting it as one would name the wrong
 * rule — so the two are separate checks with separate reports.
 *
 * The rule's reason is that Node-run code must not need the engine: PLAN §3 says
 * `art/` and `sim/` must stay PixiJS-free "for tests to run in Vitest at all".
 * `tests/` and `scripts/` are Node-run too, so the scan is the whole repository
 * (`GUARDED_ROOTS`), not just `src/`, and only two directories are allowed:
 *
 * - `src/render/` — the application's one PixiJS-aware layer.
 * - `e2e/` — Playwright drives a real browser, where the engine is legitimate.
 *
 * `tests/`, `scripts/` and the rest of `src/` are not, and an import of the
 * engine in any of them is what this fence reports.
 */

/**
 * The directories allowed to import the rendering engine: the PixiJS-aware
 * layer, and the tests a real browser runs.
 */
export const RENDERER_ALLOWED_DIRECTORIES = ['src/render/', 'e2e/'];

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * @param {string} specifier
 * @returns {string}
 */
const message = (specifier) =>
  `imports "${specifier}" — ${RENDERER_PACKAGE} exists only under ` +
  `${RENDERER_ALLOWED_DIRECTORIES.join(' or ')} (PLAN §3, ADR-0001)`;

/**
 * Every `pixi.js` import in a repository source file outside
 * `RENDERER_ALLOWED_DIRECTORIES`, with the file and line, so the offender is
 * named rather than the rule restated.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findRendererOutsideRender(root) {
  /** @type {Violation[]} */
  const violations = [];

  for (const file of collectSourceFiles(root, GUARDED_ROOTS)) {
    const repoPath = toRepoPath(root, file);
    if (RENDERER_ALLOWED_DIRECTORIES.some((directory) => repoPath.startsWith(directory))) continue;

    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
    for (const found of importsOf(source)) {
      if (!isRendererImport(found.specifier)) continue;
      violations.push({
        file: repoPath,
        line: found.line,
        column: found.column,
        message: message(found.specifier),
      });
    }
  }

  return violations;
}
