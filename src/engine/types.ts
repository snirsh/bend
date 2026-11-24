declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SessionLetter = "A" | "B" | "C";

/** ISO `YYYY-MM-DD`. Build with `calendarDate()`, which rejects impossible dates. */
export type CalendarDate = Brand<string, "CalendarDate">;

export type ExerciseId = Brand<string, "ExerciseId">;

export type EquipmentKind = "barbell" | "smith" | "dumbbell" | "cable" | "machine";

export type Category = "compound" | "isolation";

export type RepRange = { readonly min: number; readonly max: number };

export type Exercise = {
  readonly id: ExerciseId;
  readonly name: string;
  readonly equipment: EquipmentKind;
  readonly category: Category;
  readonly repRange: RepRange;
  readonly sets: number;
};

export type Superset = {
  readonly kind: "superset";
  readonly exercises: readonly [ExerciseId, ExerciseId];
};

export type StraightSet = {
  readonly kind: "straight";
  readonly exercise: ExerciseId;
};

export type Block = Superset | StraightSet;

export type PlanDay = {
  readonly letter: SessionLetter;
  readonly blocks: readonly Block[];
};

/** During a bridge, `from` is replaced by `to` (e.g. Romanian deadlift -> leg curl). */
export type BridgeSwap = { readonly from: ExerciseId; readonly to: ExerciseId };

export type Plan = {
  readonly catalog: readonly Exercise[];
  readonly days: Readonly<Record<SessionLetter, PlanDay>>;
  readonly bridgeSwaps: readonly BridgeSwap[];
};

export type LoggedSet = {
  readonly weight: number;
  readonly reps: number;
  readonly rir: number;
};

export type LoggedExercise = {
  readonly exerciseId: ExerciseId;
  readonly sets: readonly LoggedSet[];
};

export type SessionTag = "rough-night";

/**
 * A completed session. Its mode (normal/deload/bridge) is not stored: the engine
 * derives it from the session dates, so a stored mode can never disagree with the rules.
 */
export type LoggedSession = {
  readonly date: CalendarDate;
  readonly letter: SessionLetter;
  readonly exercises: readonly LoggedExercise[];
  readonly tags: readonly SessionTag[];
};

export type Mode = "normal" | "deload" | "bridge";

export type PrescribedExercise = {
  readonly exerciseId: ExerciseId;
  readonly name: string;
  readonly targetSets: number;
  readonly repRange: RepRange;
  readonly targetReps: number;
  /** `null` means never logged: the lifter picks a starting weight. */
  readonly weight: number | null;
  readonly targetRpe?: number;
  readonly substitutedFrom?: ExerciseId;
};

export type Prescription = {
  readonly date: CalendarDate;
  readonly letter: SessionLetter;
  readonly mode: Mode;
  readonly exercises: readonly PrescribedExercise[];
};

export const exerciseId = (id: string): ExerciseId => id as ExerciseId;
