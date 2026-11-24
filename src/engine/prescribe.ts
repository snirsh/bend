import { INCREMENTS_KG, MODE } from "./config.ts";
import { classifyModes } from "./mode.ts";
import { progression, type CountedSession, type Progression } from "./progression.ts";
import type {
  CalendarDate,
  Exercise,
  LoggedSession,
  Mode,
  Plan,
  PlanDay,
  PrescribedExercise,
  Prescription,
  SessionLetter,
} from "./types.ts";

const NEXT_LETTER: Readonly<Record<SessionLetter, SessionLetter>> = { A: "B", B: "C", C: "A" };
const FLOAT_SLACK = 1e-9;

type Slot = Pick<PrescribedExercise, "exerciseId" | "substitutedFrom">;
type Dose = Pick<PrescribedExercise, "targetSets" | "targetReps" | "weight" | "targetRpe">;

const slots = (day: PlanDay, mode: Mode, plan: Plan): Slot[] => {
  const ids = day.blocks.flatMap((b) => (b.kind === "superset" ? [...b.exercises] : [b.exercise]));
  if (mode !== "bridge") return ids.map((exerciseId) => ({ exerciseId }));
  const onDay = new Set(ids);
  return ids.flatMap((id): Slot[] => {
    const swap = plan.bridgeSwaps.find((s) => s.from === id);
    if (!swap) return [{ exerciseId: id }];
    return onDay.has(swap.to) ? [] : [{ exerciseId: swap.to, substitutedFrom: id }];
  });
};

const scaleDown = (kg: number | null, factor: number, increment: number): number | null =>
  kg === null ? null : Math.floor((kg * factor) / increment + FLOAT_SLACK) * increment;

const dose = (exercise: Exercise, mode: Mode, base: Progression): Dose => {
  const increment = INCREMENTS_KG[exercise.equipment];
  const targetReps = exercise.repRange.min;
  switch (mode) {
    case "normal":
      return { targetSets: exercise.sets, targetReps: base.targetReps, weight: base.weight };
    case "deload":
      return {
        targetSets: Math.max(1, exercise.sets - 1),
        targetReps,
        weight: scaleDown(base.weight, MODE.deloadFactor, increment),
      };
    case "bridge": {
      const targetSets = Math.min(MODE.bridgeSets, exercise.sets);
      return exercise.category === "compound"
        ? {
            targetSets,
            targetReps,
            weight: scaleDown(base.weight, MODE.bridgeCompoundFactor, increment),
            targetRpe: MODE.bridgeRpe,
          }
        : { targetSets, targetReps, weight: scaleDown(base.weight, MODE.bridgeIsolationFactor, increment) };
    }
  }
};

export const nextSession = (history: readonly LoggedSession[], plan: Plan, today: CalendarDate): Prescription => {
  const sessions = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const modes = classifyModes(sessions.map((s) => s.date), today);
  const counted: CountedSession[] = sessions.map((session, i) => ({
    session,
    counted: modes.history[i] === "normal" && !session.tags.includes("rough-night"),
  }));
  const last = sessions.at(-1);
  const letter = last ? NEXT_LETTER[last.letter] : "A";
  const catalog = new Map(plan.catalog.map((e) => [e.id, e]));
  const exercises = slots(plan.days[letter], modes.today, plan).map((slot): PrescribedExercise => {
    const exercise = catalog.get(slot.exerciseId);
    if (!exercise) throw new Error(`Unknown exercise id "${slot.exerciseId}" on plan day ${letter}`);
    return {
      ...slot,
      name: exercise.name,
      repRange: exercise.repRange,
      ...dose(exercise, modes.today, progression(exercise, counted)),
    };
  });
  return { date: today, letter, mode: modes.today, exercises };
};
