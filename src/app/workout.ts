import type {
  ExerciseId,
  LoggedSession,
  LoggedSet,
  Plan,
  PrescribedExercise,
  Prescription,
  SessionTag,
} from "../engine/types.ts";
import { setProblem } from "../engine/validate.ts";

export type SetSlot = {
  readonly exerciseId: ExerciseId;
  /** 0-based set number within the exercise. */
  readonly setIndex: number;
  /** 0-based position among the day's blocks that have a prescribed exercise. */
  readonly block: number;
};

/** The workout in progress. Saved after every change, so a reload resumes it. */
export type InProgress = {
  readonly version: 1;
  /** From `nextSession` when the workout starts, frozen for the session. */
  readonly prescription: Prescription;
  /** Superset blocks interleave by set (A1, B1, A2, B2), then straight sets follow. */
  readonly order: readonly SetSlot[];
  /** Sets are logged in `order`: `logged[i]` is the set done for `order[i]`. */
  readonly logged: readonly LoggedSet[];
  readonly tags: readonly SessionTag[];
};

export type UpNext = {
  readonly slot: SetSlot;
  readonly exercise: PrescribedExercise;
  /** `null` means never logged: the lifter picks a starting weight. */
  readonly weight: number | null;
  readonly reps: number;
  /** The same set last time, or that session's final set when it had fewer sets. */
  readonly last: LoggedSet | null;
};

const ROUGH_NIGHT: SessionTag = "rough-night";

export const startWorkout = (prescription: Prescription, plan: Plan): InProgress => {
  const blocks = plan.days[prescription.letter].blocks
    .map((b) =>
      (b.kind === "superset" ? b.exercises : [b.exercise]).flatMap((id) =>
        prescription.exercises.filter((e) => e.exerciseId === id || e.substitutedFrom === id),
      ),
    )
    .filter((exercises) => exercises.length > 0);
  const order = blocks.flatMap((exercises, block) =>
    Array.from({ length: Math.max(...exercises.map((e) => e.targetSets)) }, (_, setIndex) =>
      exercises.filter((e) => setIndex < e.targetSets).map((e) => ({ exerciseId: e.exerciseId, setIndex, block })),
    ).flat(),
  );
  return { version: 1, prescription, order, logged: [], tags: [] };
};

/** Logs the set for the next slot. Throws a RangeError for a set the engine would reject. */
export const logSet = (s: InProgress, set: LoggedSet): InProgress => {
  const problem = setProblem(set);
  if (problem) throw new RangeError(problem);
  return s.logged.length < s.order.length ? { ...s, logged: [...s.logged, set] } : s;
};

export const setRoughNight = (s: InProgress, on: boolean): InProgress => ({
  ...s,
  tags: [...s.tags.filter((t) => t !== ROUGH_NIGHT), ...(on ? [ROUGH_NIGHT] : [])],
});

const loggedFor = (s: InProgress, id: ExerciseId): LoggedSet[] =>
  s.logged.filter((_, i) => s.order[i]?.exerciseId === id);

/** The sets from the latest-dated session that logged `id`; on a tie, the later one in `history`. */
const lastTime = (history: readonly LoggedSession[], id: ExerciseId): readonly LoggedSet[] | undefined => {
  let latest: LoggedSession | undefined;
  for (const session of history) {
    if (session.exercises.some((e) => e.exerciseId === id) && (!latest || session.date >= latest.date)) latest = session;
  }
  return latest?.exercises.find((e) => e.exerciseId === id)?.sets;
};

/** The next set to log with its prefilled values, or `null` once every set is logged. */
export const upNext = (s: InProgress, history: readonly LoggedSession[]): UpNext | null => {
  const slot = s.order[s.logged.length];
  if (!slot) return null;
  const exercise = s.prescription.exercises.find((e) => e.exerciseId === slot.exerciseId);
  if (!exercise) throw new Error(`Slot exercise "${slot.exerciseId}" is not in the prescription`);
  const previous = lastTime(history, slot.exerciseId);
  const sameSet = previous?.[slot.setIndex];
  return {
    slot,
    exercise,
    weight: loggedFor(s, slot.exerciseId).at(-1)?.weight ?? exercise.weight,
    reps: sameSet?.reps ?? exercise.targetReps,
    last: sameSet ?? previous?.at(-1) ?? null,
  };
};

/** The session to save, keeping only exercises with a logged set. `null` when nothing was logged. */
export const toLoggedSession = (s: InProgress): LoggedSession | null => {
  const exercises = s.prescription.exercises.flatMap(({ exerciseId }) => {
    const sets = loggedFor(s, exerciseId);
    return sets.length > 0 ? [{ exerciseId, sets }] : [];
  });
  if (exercises.length === 0) return null;
  return { date: s.prescription.date, letter: s.prescription.letter, exercises, tags: s.tags };
};
