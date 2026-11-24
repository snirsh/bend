import type { ExerciseId, Prescription, PrescribedExercise } from "../src/engine/types.ts";

export const pick = (p: Prescription, id: ExerciseId): PrescribedExercise => {
  const found = p.exercises.find((e) => e.exerciseId === id);
  if (!found) throw new Error(`${id} not prescribed; got ${p.exercises.map((e) => e.exerciseId).join(",")}`);
  return found;
};
