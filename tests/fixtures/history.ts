import type {
  CalendarDate,
  ExerciseId,
  LoggedExercise,
  LoggedSession,
  LoggedSet,
  SessionLetter,
  SessionTag,
} from "../../src/engine/types.ts";

const EPOCH = Date.UTC(2026, 0, 1);

/** `day(0)` is 2026-01-01; `day(n)` is n calendar days later. */
export const day = (n: number): CalendarDate =>
  new Date(EPOCH + n * 86_400_000).toISOString().slice(0, 10) as CalendarDate;

/** Each entry is one set: [weight, reps, rir]. */
export const sets = (...s: ReadonlyArray<readonly [number, number, number]>): LoggedSet[] =>
  s.map(([weight, reps, rir]) => ({ weight, reps, rir }));

/** `n` identical sets. */
export const same = (n: number, weight: number, reps: number, rir: number): LoggedSet[] =>
  Array.from({ length: n }, () => ({ weight, reps, rir }));

export const ex = (exerciseId: ExerciseId, loggedSets: LoggedSet[]): LoggedExercise => ({
  exerciseId,
  sets: loggedSets,
});

export const session = (
  date: CalendarDate,
  letter: SessionLetter,
  exercises: LoggedExercise[] = [],
  tags: SessionTag[] = [],
): LoggedSession => ({ date, letter, exercises, tags });

export const rough = (date: CalendarDate, letter: SessionLetter, exercises: LoggedExercise[] = []): LoggedSession =>
  session(date, letter, exercises, ["rough-night"]);
