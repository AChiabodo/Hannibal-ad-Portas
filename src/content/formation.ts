import type { Formation } from '../sim/command.ts';

/** Purchased files and ranks, shared by arrival spacing and procedural figures. */
export function formationShape(capacity: number, formation: Formation): { readonly files: number; readonly ranks: number } {
  const lineFiles = capacity <= 1 ? 1 : capacity <= 12 ? 4 : capacity <= 24 ? 6
    : capacity <= 48 || capacity === 64 ? 8 : capacity <= 60 ? 10 : 12;
  const files = Math.min(capacity, formation === 'column' ? Math.ceil(lineFiles / 2) : lineFiles);
  return { files, ranks: Math.ceil(capacity / files) };
}
