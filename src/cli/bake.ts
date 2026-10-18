/**
 * The bake step: the whole generated catalogue written out as files (ADR-0002, PLAN §3).
 *
 * The pipeline is `generator → bake at build time → texture at runtime`, and the
 * point of the middle step is inspection: the runtime regenerates every pixel from
 * the same library this command bakes with, so the files exist to be opened,
 * diffed and judged rather than to be loaded (ADR-0002 rejects committing them for
 * exactly that reason). They land in a gitignored folder, and what is pinned in CI
 * is not their bytes but the pixel hash of the buffer that produced them — which
 * is why every line this command prints carries one.
 *
 * Everything here is a function of the catalogue and the output directory, with no
 * clock, no path in the printed table and no ordering that could vary: the same
 * library bakes the same names in the same order on every machine. The command's
 * streams and exit codes are `bake-main.ts`, the way the Match's are `main.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue, cataloguePlate } from '../art/catalogue.ts';
import { hashPixelBuffer, type PixelBuffer } from '../art/pixel-buffer.ts';
import { UsageError } from './arguments.ts';
import { encodePng } from './png.ts';

/** Where baked files go unless the caller says otherwise: build output, never committed. */
export const DEFAULT_OUT = 'artifacts';

/** The name the whole catalogue plate bakes under, beside one file per artefact. */
export const PLATE_NAME = 'catalogue';

export const USAGE = `Usage: node src/cli/bake-main.ts [--out <dir>]

Writes every generated artefact to <dir> (default: ${DEFAULT_OUT}): one PNG per
glyph and per ramp in the catalogue, plus the whole catalogue plate. Prints one
line per file with its name, its size in pixels and its pixel hash.

The files are build products and the game never reads them back: the runtime draws
from the same generators this command baked from. They exist so that art can be
looked at and diffed outside a browser.

Exit codes: 0 baked, 2 the command line was misused.`;

/** One baked artefact: what it is, where it went, and the hash of the pixels in it. */
export interface BakedArtefact {
  /** The catalogue's name for it, e.g. `glyph:U+00E0` or `ramp:bronze`. */
  readonly name: string;
  /** Its path, relative to the output directory. */
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /** The pixel hash, which is the same number on every machine (see `pixel-buffer.ts`). */
  readonly hash: string;
}

/** What a caller asked for on the command line. */
export type BakeArguments = { readonly kind: 'help' } | { readonly kind: 'bake'; readonly out: string };

/**
 * Reads a bake command line.
 *
 * @throws UsageError when a flag is unknown, repeated, or missing its value.
 */
export function parseBakeArguments(argv: readonly string[]): BakeArguments {
  let out = DEFAULT_OUT;
  let asked = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { kind: 'help' };
    if (flag !== '--out') throw new UsageError(`${String(flag)} is not an option this command knows`);
    if (asked) throw new UsageError('--out was given twice');

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError('--out needs a directory');
    }
    out = value;
    asked = true;
    index += 1;
  }

  return { kind: 'bake', out };
}

/** Everything the catalogue holds, plus the plate that shows all of it at once. */
export function artefactsToBake(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return [...catalogue(), { name: PLATE_NAME, buffer: cataloguePlate() }];
}

/**
 * Writes every artefact into `out` as a PNG, creating the directory if it is not
 * there, and answers with what it wrote.
 */
export function bakeAll(out: string): readonly BakedArtefact[] {
  mkdirSync(out, { recursive: true });

  return artefactsToBake().map(({ name, buffer }) => {
    const file = `${fileNameOf(name)}.png`;
    writeFileSync(join(out, file), encodePng(buffer));

    return {
      name,
      file,
      width: buffer.width,
      height: buffer.height,
      hash: hashPixelBuffer(buffer),
    };
  });
}

/**
 * The bake as text: one aligned line per artefact.
 *
 * Byte-stable, so two runs diff cleanly, and free of the output directory and of
 * any clock — a path in a report is a report that differs between two machines
 * that did the same thing.
 */
export function formatBake(artefacts: readonly BakedArtefact[]): string {
  const width = Math.max('artefact'.length, ...artefacts.map((artefact) => artefact.name.length));
  const lines = [
    `${'artefact'.padEnd(width)}  ${'pixels'.padEnd(9)}  hash`,
    ...artefacts.map(
      (artefact) =>
        `${artefact.name.padEnd(width)}  ${`${String(artefact.width)}x${String(artefact.height)}`.padEnd(9)}  ${artefact.hash}`,
    ),
  ];

  return `${lines.join('\n')}\n`;
}

/** A catalogue name as a file name: a colon and a plus are not safe in one everywhere. */
function fileNameOf(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-');
}
