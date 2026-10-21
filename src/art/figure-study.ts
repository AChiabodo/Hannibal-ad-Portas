/** Authored alternatives for #67. These are comparison art, never roster options. */
import { FIGURE_LOOKS, soldier, type FigureName, type FigureFacing, type FigureFaction, type FigureFrame } from './figures.ts';
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, pixelAt, setPixel, type PixelBuffer } from './pixel-buffer.ts';

export const FIGURE_TREATMENTS = ['native', 'compact', 'fine'] as const;
export type FigureTreatment = typeof FIGURE_TREATMENTS[number];

/** Fine art has twice the source pixels, displayed at half size in the study. */
export function studyFigure(name: FigureName, facing: FigureFacing, frame: FigureFrame, faction: FigureFaction, treatment: FigureTreatment): PixelBuffer {
  if (treatment === 'native') return soldier(name, facing, frame, faction);
  const base = soldier(name, facing, frame, faction);
  if (treatment === 'fine') {
    const fine = createPixelBuffer(base.width * 2, base.height * 2);
    for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
      const ink = pixelAt(base, x, y);
      fillRect(fine, x * 2, y * 2, 2, 2, ink);
      // Half-pixel seams and glints genuinely add source detail. Whether that
      // detail survives display reduction is the question, not an assumption.
      if (ink[3] !== 0 && x > 2 && y > 6 && (x + y) % 3 === 0) {
        setPixel(fine, x * 2, y * 2, shadeAt(RAMPS.bronze, 5));
      }
    }
    return fine;
  }
  // A separate native 7x10 drawing: no resampling of the original Figure.
  const compact = createPixelBuffer(7, 10);
  const cloth = shadeAt(faction === 'rome' ? RAMPS.blood : RAMPS.parchment, 4);
  const dark = shadeAt(RAMPS.bronze, 1);
  const metal = shadeAt(RAMPS.bronze, 5);
  const skin = shadeAt(RAMPS.parchment, 1);
  const look = FIGURE_LOOKS[name];
  if (look.kind === 'beast') {
    fillRect(compact, 0, 3, 6, 5, shadeAt(RAMPS.stone, 3));
    fillRect(compact, 1, 2, 4, 2, cloth);
    fillRect(compact, 1, 8, 1, 2, dark);
    fillRect(compact, 4, 8, 1, 2, dark);
    fillRect(compact, 6, 4, 1, 5, shadeAt(RAMPS.stone, 4));
  } else if (frame.action === 'death') {
    fillRect(compact, 0, 8, 6, 2, dark);
    fillRect(compact, 1, 8, 4, 1, cloth);
    setPixel(compact, 0, 8, skin);
  } else {
    const lift = frame.action === 'walk' ? frame.step : 0;
    fillRect(compact, 2, 4 - lift, 3, 4, cloth);
    fillRect(compact, 2, 2 - lift, 2, 2, facing === 'north' ? dark : skin);
    fillRect(compact, 1, 1, look.helmet === 'transverse' ? 5 : 3, 1, look.helmet === 'bare' ? dark : metal);
    if (look.helmet === 'crest') setPixel(compact, 2, 0, cloth);
    fillRect(compact, 2, 8, 1, 2 - lift, dark);
    fillRect(compact, 4, 8, 1, 2, dark);
    if (look.shield !== 'none') {
      const tall = ['scutum', 'gaulish', 'thureos'].includes(look.shield);
      fillRect(compact, 4, tall ? 4 : 5, 3, tall ? 4 : 3, metal);
      fillRect(compact, 5, 5, 1, 2, cloth);
    }
    const long = ['hasta', 'spear', 'longsword', 'pilum', 'javelins'].includes(look.weapon);
    fillRect(compact, 0, long ? 0 : 5, 1, long ? 8 : 3, dark);
    setPixel(compact, 0, long ? 0 : 5, metal);
    if (look.mount === 'horse') {
      fillRect(compact, 0, 6, 6, 2, shadeAt(RAMPS.stone, 3));
      fillRect(compact, 5, 4, 2, 3, shadeAt(RAMPS.stone, 3));
      setPixel(compact, 5, 9, dark);
    }
  }
  if (facing === 'west' || facing === 'north') {
    const copy = compact.pixels.slice();
    for (let y = 0; y < 10; y++) for (let x = 0; x < 7; x++) {
      const at = (y * 7 + 6 - x) * 4;
      setPixel(compact, x, y, [copy[at]!, copy[at + 1]!, copy[at + 2]!, copy[at + 3]!]);
    }
  }
  return compact;
}
