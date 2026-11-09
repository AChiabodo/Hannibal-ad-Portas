/** Reproducible comparative art, shared by Atelier and #67's browser producer. */
import { FIGURE_FACINGS, figureFrame, type FigureFaction } from '../art/figures.ts';
import { studyFigure, type FigureTreatment } from '../art/figure-study.ts';
import { siteSprite, type SettlementLook } from '../art/settlements.ts';
import { createPixelBuffer, fillRect, pixelAt, setPixel, strokeRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import { textPlate } from '../art/font.ts';
import { RAMPS, shadeAt } from '../art/palette.ts';
import { blockMen, FILE_STEP, RANK_STEP, type BlockShape } from './squads.ts';

export const STUDY_SIZE = { width: 300, height: 150 };
const INK = shadeAt(RAMPS.parchment, 6);

/** Twice-native canvas: fine candidates keep their half-pixel detail until GPU display. */
export function formationStudy(faction: FigureFaction, treatment: FigureTreatment, proportions = false): PixelBuffer {
  const plate = createPixelBuffer(STUDY_SIZE.width * 2, STUDY_SIZE.height * 2, shadeAt(RAMPS.olive, 2));
  const type = faction === 'rome' ? 'principes' : 'libyan-spear';
  const figure = studyFigure(type, 'south', figureFrame('idle', 0), faction, treatment);
  function paint(buffer: PixelBuffer, x: number, y: number, scale = 2): void {
    for (let row = 0; row < buffer.height; row++) for (let column = 0; column < buffer.width; column++) {
      const pixel = pixelAt(buffer, column, row);
      if (pixel[3] !== 0) fillRect(plate, x * 2 + column * scale, y * 2 + row * scale, scale, scale, pixel);
    }
  }
  function label(text: string, x: number, y: number): void { paint(textPlate(text, INK), x, y); }
  function block(shape: BlockShape, x: number, y: number, selected = false): void {
    const image = studyFigure(type, shape.facing, figureFrame('idle', 0), faction, treatment);
    const sourceScale = treatment === 'fine' ? 2 : 1;
    const slots = blockMen({ ...shape, men: shape.capacity ?? shape.men });
    const men = blockMen(shape);
    const left = Math.min(...slots.map((man) => man.x));
    const top = Math.min(...slots.map((man) => man.y));
    const width = Math.max(...slots.map((man) => man.x)) - left + image.width / sourceScale;
    const height = Math.max(...slots.map((man) => man.y)) - top + image.height / sourceScale;
    if (selected) strokeRect(plate, x * 2, y * 2, width * 2, height * 2, INK);
    for (const man of [...men].sort((a, b) => a.y - b.y || a.x - b.x)) {
      paint(image, x + man.x - left, y + man.y - top, 2 / sourceScale);
    }
  }
  label(`${faction} ${treatment} ${FILE_STEP}/${RANK_STEP}`, 3, 2);
  paint(figure, 280, 1, treatment === 'fine' ? 1 : 2);
  if (!proportions) for (const [index, formation] of (['line', 'column'] as const).entries()) {
    const y = 23 + index * 64;
    label(formation === 'line' ? 'Linea 24/24 - 13/24' : 'Colonna 24/24 - 13/24', 3, y - 8);
    let x = 3;
    for (const men of [24, 13]) for (const facing of FIGURE_FACINGS) {
      const shape = { men, capacity: 24, seed: 67, formation, facing };
      const slots = blockMen({ ...shape, men: 24 });
      block(shape, x, y, men === 13);
      x += Math.max(...slots.map((man) => man.x)) - Math.min(...slots.map((man) => man.x)) + 14;
    }
  }
  if (proportions) {
    label('60:10x6  64:8x8  120   Minore   Roccaforte', 3, 15);
    block({ men: 60, capacity: 60, formation: 'line', facing: 'south' }, 3, 27);
    block({ men: 64, capacity: 64, formation: 'line', facing: 'south' }, 57, 27);
    block({ men: 120, capacity: 120, formation: 'line', facing: 'south' }, 103, 27);
    const site: SettlementLook = { kind: 'settlement', owner: faction, memory: 'seen', gateSide: 'south', gate: null,
      walls: { north: 'intact', east: 'damaged', south: 'intact', west: 'breached' }, ram: 'none' };
    paint(siteSprite(site), 168, 26);
    paint(siteSprite({ ...site, kind: 'stronghold', gate: 'breached', ram: faction === 'rome' ? 'built' : 'none' }), 223, 23);
    label('Sovrapposti  Memoria    Castrum', 3, 90);
    block({ men: 24, formation: 'line', facing: 'south' }, 3, 102);
    block({ men: 13, capacity: 24, seed: 68, formation: 'line', facing: 'east' }, 18, 109, true);
    paint(siteSprite({ ...site, memory: 'remembered', camp: true }), 92, 100);
    paint(siteSprite({ ...site, camp: faction === 'rome' }), 168, 100);
    paint(studyFigure(type, 'south', figureFrame('death', 0), faction, treatment), 60, 130, treatment === 'fine' ? 1 : 2);
  }
  // Reference pixels expose odd-zoom aliasing without pretending to aesthetic proof.
  setPixel(plate, 1, 1, INK);
  return plate;
}
