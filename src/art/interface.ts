/** Interface surfaces share the palette and the same pure pixel path as icons. */
import { BASE, RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer } from './pixel-buffer.ts';

export const CONTROL_LOOKS = {
  idle: { ground: BASE.night, edge: shadeAt(RAMPS.stone, 2) },
  selected: { ground: shadeAt(RAMPS.bronze, 1), edge: shadeAt(RAMPS.bronze, 4) },
  armed: { ground: shadeAt(RAMPS.bronze, 2), edge: shadeAt(RAMPS.parchment, 6) },
  disabled: { ground: BASE.night, edge: shadeAt(RAMPS.stone, 1) },
  focus: { ground: BASE.night, edge: shadeAt(RAMPS.parchment, 6) },
} as const;

export type ControlLook = keyof typeof CONTROL_LOOKS;
interface Box { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Paint once, then place words and icons inside the exact same rectangle. */
export function paintControl(buffer: PixelBuffer, rect: Box, look: ControlLook): void {
  const style = CONTROL_LOOKS[look];
  fillRect(buffer, rect.x, rect.y, rect.width, rect.height, style.ground);
  strokeRect(buffer, rect.x, rect.y, rect.width, rect.height, style.edge);
  if (look === 'selected' || look === 'armed') fillRect(buffer, rect.x + rect.width - 3, rect.y + 1, 2, rect.height - 2, style.edge);
}

/** Focus is an inset outline, distinguishable from an armed card's solid fill. */
export function paintFocus(buffer: PixelBuffer, rect: Box): void {
  strokeRect(buffer, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, CONTROL_LOOKS.focus.edge);
}

/** Declarative specimens shown by the Atelier and exported by bake. */
export function interfaceEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return (Object.keys(CONTROL_LOOKS) as ControlLook[]).map((look) => {
    const buffer = createPixelBuffer(72, 26);
    const rect = { x: 0, y: 0, width: buffer.width, height: buffer.height };
    paintControl(buffer, rect, look);
    if (look === 'focus') paintFocus(buffer, rect);
    return { name: `interface:${look}`, buffer };
  });
}
