/** Filtered, serializable appearance contract shared by Observation and pure art. */
export interface ObservedWork {
  readonly building: string;
  readonly ordinal: number;
  /** 0/1 construction, 2 intact, 3 damaged, 4 ruin, 5 repair. */
  readonly stage: number;
  readonly origin: 'rome' | 'carthage';
}
export interface ObservedSettlementTile {
  /** Row-major within the 25×25 settlement grounds, in world-facing coordinates. */
  readonly cell: number;
  readonly seen: number;
  readonly visible: boolean;
  readonly origin?: 'rome' | 'carthage';
  readonly tier?: number;
  readonly owner?: 'rome' | 'carthage' | 'none';
  readonly work?: ObservedWork;
  readonly structure?: {
    readonly kind: 'gate' | 'wall';
    readonly side: number;
    readonly condition: 'intact' | 'damaged' | 'breached';
  };
  readonly garrison?: boolean;
  readonly ram?: 'building' | 'built';
}
export interface ObservedSettlement {
  readonly id: number;
  readonly kind: 'stronghold' | 'settlement';
  readonly x: number;
  readonly y: number;
  readonly gateSide: number;
  readonly memory: 'seen' | 'remembered';
  readonly owner: 'rome' | 'carthage' | null;
  readonly tier?: number;
  readonly tiles: readonly ObservedSettlementTile[];
}
