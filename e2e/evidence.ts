/**
 * Where visual frames come from, and — more often — why they do not (ticket #64).
 *
 * A screenshot is expensive: it asks the browser to compose the whole page at
 * whatever viewport the scene asked for, and at 1920x1080 through software
 * WebGL it is the slowest thing a browser test does. The *assertions* beside a
 * frame are not expensive, so the two are separated:
 *
 * - the complete acceptance profile runs every functional check with captures
 *   off, which is why it is a gate rather than a screenshot generator;
 * - `npm run test:visual` sets `SPQR_VISUAL=1` and writes the same scenes to
 *   disk, explicitly and deliberately, so evidence is produced when someone
 *   asked for evidence rather than on every run.
 *
 * Nothing else in the specs knows about `%TEMP%`, folders or file names: one
 * function writes a frame, one variable decides whether it should, and a missing
 * directory is created only when there is something to put in it.
 */
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Whether this run is producing visual evidence.
 *
 * Read once, when a worker starts. A profile sets it for the whole run, so a
 * test cannot accidentally capture a frame in the acceptance gate.
 */
export const VISUAL_EVIDENCE = process.env.SPQR_VISUAL === '1';

/**
 * Where the frames land.
 *
 * Outside the repository by default, because the asset guard forbids committed
 * image files (ADR-0002) and evidence is not a product. The visual profile sets
 * `SPQR_VISUAL_DIR` so its report can name the directory it used.
 */
export const EVIDENCE_DIR = process.env.SPQR_VISUAL_DIR ?? join(tmpdir(), 'spqr-visual');

/**
 * The issue folder a frame belongs to, so one visual run keeps the provenance
 * that the per-issue `%TEMP%` folders used to carry.
 */
export type EvidenceFolder =
  | 'issue70'
  | 'issue52'
  | 'issue53'
  | 'issue54'
  | 'issue55'
  | 'issue56'
  | 'issue57'
  | 'issue58'
  | 'issue59'
  | 'issue62'
  | 'issue64'
  | 'issue67'
  | 'issue68' | 'issue69';

/**
 * Presents the frame the page has just drawn and, when the run is producing
 * evidence, writes it.
 *
 * The `requestAnimationFrame` wait stays inside the guard on purpose: it exists
 * only so the *picture* is the frame Pixi just composed, and a run that is not
 * taking a picture has no reason to wait for one.
 *
 * @returns the path written, or `null` when this run does not produce frames.
 */
export async function capture(
  page: Page,
  name: string,
  folder: EvidenceFolder = 'issue64',
): Promise<string | null> {
  if (!VISUAL_EVIDENCE) return null;

  const directory = join(EVIDENCE_DIR, folder);
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => { resolve(); })));

  const path = join(directory, `${name}.png`);
  await page.screenshot({ path });

  return path;
}
