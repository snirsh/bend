import { INCREMENTS_KG } from "./config.ts";
import type { Exercise, LoggedSession, LoggedSet, RepRange } from "./types.ts";

const MAX_RIR_TO_PROGRESS = 2;
const MISSES_TO_STEP_DOWN = 2;

export type CountedSession = { readonly session: LoggedSession; readonly counted: boolean };

export type Progression = { readonly weight: number | null; readonly targetReps: number };

type State = Progression & { readonly missStreak: number };

type Outcome =
  | { readonly kind: "progress" }
  | { readonly kind: "miss" }
  | { readonly kind: "in-range"; readonly weakestReps: number };

/** A lighter prescription never drops below one increment, or below `from` when `from` is already lighter. */
export const atLeastOneStep = (kg: number, from: number, increment: number): number =>
  Math.max(kg, Math.min(from, increment));

const heaviest = (sets: readonly LoggedSet[]): number => Math.max(...sets.map((s) => s.weight));

const outcome = (sets: readonly LoggedSet[], { min, max }: RepRange): Outcome => {
  if (sets.some((s) => s.reps < min)) return { kind: "miss" };
  if (sets.every((s) => s.reps >= max && s.rir <= MAX_RIR_TO_PROGRESS)) return { kind: "progress" };
  return { kind: "in-range", weakestReps: Math.min(...sets.map((s) => s.reps)) };
};

const fold = (exercise: Exercise, state: State, sets: readonly LoggedSet[]): State => {
  const { min, max } = exercise.repRange;
  const increment = INCREMENTS_KG[exercise.equipment];
  const weight = heaviest(sets);
  const result = outcome(sets, exercise.repRange);
  switch (result.kind) {
    case "progress":
      return { weight: weight + increment, targetReps: min, missStreak: 0 };
    case "in-range":
      return { weight, targetReps: Math.min(result.weakestReps + 1, max), missStreak: 0 };
    case "miss": {
      const missStreak = state.missStreak + 1;
      return missStreak === MISSES_TO_STEP_DOWN
        ? { weight: atLeastOneStep(weight - increment, weight, increment), targetReps: min, missStreak: 0 }
        : { weight, targetReps: min, missStreak };
    }
  }
};

export const progression = (exercise: Exercise, history: readonly CountedSession[]): Progression => {
  const logs = history.flatMap(({ session, counted }) => {
    const sets = session.exercises.filter((e) => e.exerciseId === exercise.id).flatMap((e) => e.sets);
    return sets.length > 0 ? [{ sets, counted }] : [];
  });
  const lastUncounted = logs.filter((log) => !log.counted).at(-1);
  const start: State = {
    weight: lastUncounted ? heaviest(lastUncounted.sets) : null,
    targetReps: exercise.repRange.min,
    missStreak: 0,
  };
  const { weight, targetReps } = logs
    .filter((log) => log.counted)
    .reduce((state, log) => fold(exercise, state, log.sets), start);
  return { weight, targetReps };
};
