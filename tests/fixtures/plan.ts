import { exerciseId, type Exercise, type Plan } from "../../src/engine/types.ts";

export const ids = {
  bench: exerciseId("bench"),
  row: exerciseId("row"),
  rdl: exerciseId("rdl"),
  squat: exerciseId("squat"),
  raise: exerciseId("raise"),
  curl: exerciseId("curl"),
  calf: exerciseId("calf"),
} as const;

const catalog: readonly Exercise[] = [
  { id: ids.bench, name: "Bench", equipment: "barbell", category: "compound", repRange: { min: 8, max: 10 }, sets: 3 },
  { id: ids.row, name: "Row", equipment: "cable", category: "compound", repRange: { min: 8, max: 12 }, sets: 3 },
  { id: ids.rdl, name: "RDL", equipment: "barbell", category: "compound", repRange: { min: 5, max: 10 }, sets: 3 },
  { id: ids.squat, name: "Squat", equipment: "smith", category: "compound", repRange: { min: 5, max: 10 }, sets: 3 },
  { id: ids.raise, name: "Raise", equipment: "dumbbell", category: "isolation", repRange: { min: 15, max: 20 }, sets: 2 },
  { id: ids.curl, name: "Curl", equipment: "machine", category: "isolation", repRange: { min: 10, max: 15 }, sets: 3 },
  { id: ids.calf, name: "Calf", equipment: "machine", category: "isolation", repRange: { min: 10, max: 15 }, sets: 1 },
];

/**
 * A: bench+row superset, then RDL (bridge swaps RDL for curl).
 * B: squat+raise superset, then calf (a 1-set exercise).
 * C: RDL+curl superset (bridge swap would duplicate curl).
 */
export const fixturePlan: Plan = {
  catalog,
  days: {
    A: {
      letter: "A",
      blocks: [
        { kind: "superset", exercises: [ids.bench, ids.row] },
        { kind: "straight", exercise: ids.rdl },
      ],
    },
    B: {
      letter: "B",
      blocks: [
        { kind: "superset", exercises: [ids.squat, ids.raise] },
        { kind: "straight", exercise: ids.calf },
      ],
    },
    C: {
      letter: "C",
      blocks: [{ kind: "superset", exercises: [ids.rdl, ids.curl] }],
    },
  },
  bridgeSwaps: [{ from: ids.rdl, to: ids.curl }],
};
