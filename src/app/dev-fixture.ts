/**
 * DEV FIXTURE — not the real split, pending Snir's answers.
 *
 * The real A/B/C days in src/plan/plan.ts are still empty. Until they exist, every
 * day runs this one: Smith squat + chest supported row as a superset, then bench press.
 * Moves come from the real catalog. The cue texts and short labels are fixture data too.
 */
import { exerciseId, type ExerciseId, type Plan, type PlanDay, type SessionLetter } from "../engine/types.ts";
import { plan as realPlan } from "../plan/plan.ts";

const squat = exerciseId("smith-squat");
const row = exerciseId("chest-supported-row");
const bench = exerciseId("bench-press");

const fixtureDay = (letter: SessionLetter): PlanDay => ({
  letter,
  blocks: [
    { kind: "superset", exercises: [squat, row] },
    { kind: "straight", exercise: bench },
  ],
});

export const devFixturePlan: Plan = {
  ...realPlan,
  days: { A: fixtureDay("A"), B: fixtureDay("B"), C: fixtureDay("C") },
};

export type Cue = {
  /** Shown in titles, e.g. "Squat + Row". */
  readonly label: string;
  /** Shown on the set ticker, e.g. "Sq 1". */
  readonly tag: string;
  readonly cue: string;
  /** The longer hint behind the cue card's info button. */
  readonly hint: string;
};

/** DEV FIXTURE cue texts, keyed by exercise id. */
export const devFixtureCues: Readonly<Partial<Record<ExerciseId, Cue>>> = {
  [squat]: {
    label: "Squat",
    tag: "Sq",
    cue: "Feet under the bar. Sit between the heels. Drive the floor away.",
    hint: "Brace before you unlock the bar and keep the brace through the whole rep. Knees track over the toes.",
  },
  [row]: {
    label: "Row",
    tag: "Row",
    cue: "Chest tall. Pull the elbows past the body. Pause a beat at the ribs.",
    hint: "Keep the chest on the pad the whole set. If it lifts off, the weight is too heavy for the reps.",
  },
  [bench]: {
    label: "Bench",
    tag: "Bench",
    cue: "Shoulder blades pinned. Bar to the lower chest. Press back over the eyes.",
    hint: "Feet planted and still. Touch the chest softly every rep, no bounce.",
  },
};
