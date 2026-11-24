import type { EquipmentKind } from "./types.ts";

export const INCREMENTS_KG: Readonly<Record<EquipmentKind, number>> = {
  barbell: 2.5,
  smith: 2.5,
  dumbbell: 2,
  cable: 2.5,
  machine: 2.5,
};

export const MODE = {
  deloadFactor: 0.9,
  bridgeCompoundFactor: 0.8,
  bridgeIsolationFactor: 0.9,
  bridgeSets: 2,
  bridgeRpe: 5,
  deloadGapDays: 7,
  bridgeGapDays: 14,
  bridgeLengthDays: 14,
} as const;
