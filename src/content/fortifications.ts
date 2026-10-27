/** Initial, shared Tier parameters approved in issue #74 (Q17/Q31). */
export function garrisonCapacity(tier: number): number {
  return tier >= 3 ? 240 : tier >= 2 ? 120 : 60;
}
export function fortificationHp(tier: number, gate: boolean): number {
  return (tier >= 3 ? 120 : tier >= 2 ? 90 : 60) * (gate ? 2 : 1);
}

/** Stone required to repair the missing health of a fortification. */
export function fortificationRepairStone(maxHp: number, hp: number): number {
  return Math.max(1, Math.ceil((maxHp - hp) / 15));
}
