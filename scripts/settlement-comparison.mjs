/** Pure-generator evidence for #74. Never launches a browser. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { settlementComposition } from '../src/art/settlement-composition.ts';
import { settlementLayout } from '../src/content/settlement-layout.ts';
import { createPixelBuffer, blit } from '../src/art/pixel-buffer.ts';
import { drawText } from '../src/art/font.ts';
import { squadBlock } from '../src/render/squads.ts';
import { encodePng } from '../src/cli/png.ts';

const out = createPixelBuffer(1680, 3390, [36, 43, 38, 255]);
const ink = /** @type {const} */ ([235, 219, 180, 255]);
const variants = /** @type {const} */ ([['rome', 'stronghold'], ['carthage', 'stronghold'], ['rome', 'settlement'], ['carthage', 'settlement']]);
for (const [column, [origin, kind]] of variants.entries()) {
  for (let row = 0; row < 7; row += 1) {
    const tier = Math.max(1, Math.min(3, row));
    const works = row === 0 ? [] : settlementLayout(kind).lots.filter((lot) =>
      (origin === 'rome' || lot.building !== 'castrum') &&
      (row >= 4 || (lot.ordinal === 0 && (lot.building !== 'villa' || tier >= 2) &&
        (lot.building !== 'forum' || tier >= 3)))).map((lot) => ({ ...lot, stage: row === 5 ? 0 : row === 6 ? 1 : 2, origin }));
    const sprite = settlementComposition({ kind, tier, owner: origin, works, garrison: kind === 'stronghold' });
    const x = column * 420 + 10;
    const y = row * 440 + 30;
    drawText(out, `${origin} ${kind} ${row === 0 ? 'INIZIALE' : row === 4 ? 'COMPLETO' : row === 5 ? 'FONDAMENTA' : row === 6 ? 'CANTIERI' : 'LIVELLO ' + tier}`, x, y - 20, ink);
    blit(out, sprite, x, y);
  }
}
const troops = /** @type {const} */ ([['hastati', 24], ['hastati', 60], ['hastati', 120], ['libyan-spear', 24], ['libyan-spear', 48], ['numidian-horse', 12], ['elephant', 24]]);
for (const [column, [type, capacity]] of troops.entries()) {
  const faction = column < 3 ? 'rome' : 'carthage';
  drawText(out, `${type} ${capacity}`, column * 230 + 10, 3120, ink);
  for (const [row, formation] of (/** @type {const} */ (['line', 'column'])).entries()) {
    const block = squadBlock({ id: column, type, capacity, figures: type === 'elephant' ? 1 : capacity, formation, facing: 'south', goal: null }, { faction });
    drawText(out, formation, column * 230 + 10, 3140 + row * 100, ink);
    blit(out, block, column * 230 + 80, 3135 + row * 100);
  }
}
const target = resolve(process.argv[2] ?? 'artifacts/issue-74/compositional-comparison.png');
await mkdir(resolve(target, '..'), { recursive: true });
await writeFile(target, encodePng(out));
process.stdout.write(target + '\n');
