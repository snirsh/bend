import { exerciseId, type Exercise, type ExerciseId, type Plan, type PlanDay, type SessionLetter, type Superset } from "../engine/types.ts";

const id = {
  legCurl: exerciseId("leg-curl"),
  smithSquat: exerciseId("smith-squat"),
  romanianDeadlift: exerciseId("romanian-deadlift"),
  legExtensions: exerciseId("leg-extensions"),
  hipsSuperset: exerciseId("hips-superset"),
  calfRaises: exerciseId("calf-raises"),
  benchPress: exerciseId("bench-press"),
  shoulderPress: exerciseId("shoulder-press"),
  flies: exerciseId("flies"),
  latRaises: exerciseId("lat-raises"),
  overheadTriceps: exerciseId("overhead-triceps"),
  cableKickback: exerciseId("cable-kickback"),
  closeGripLatPulldown: exerciseId("close-grip-lat-pulldown"),
  chestSupportedRow: exerciseId("chest-supported-row"),
  closeGripRow: exerciseId("close-grip-row"),
  cableFlies: exerciseId("cable-flies"),
  shrugs: exerciseId("shrugs"),
  ezCurl: exerciseId("ez-curl"),
  preacherCurls: exerciseId("preacher-curls"),
} as const;

// Names, sets and rep ranges come from the source plan.
// Every `equipment` and `category` value is an inference, marked `// assumption`.
export const catalog: readonly Exercise[] = [
  // Legs
  { id: id.legCurl, name: "Leg curl", sets: 3, repRange: { min: 10, max: 15 }, equipment: "machine", category: "isolation" }, // assumption
  { id: id.smithSquat, name: "Smith squat", sets: 3, repRange: { min: 5, max: 10 }, equipment: "smith", category: "compound" }, // assumption
  { id: id.romanianDeadlift, name: "Romanian deadlift", sets: 3, repRange: { min: 5, max: 10 }, equipment: "barbell", category: "compound" }, // assumption
  { id: id.legExtensions, name: "Leg extensions", sets: 3, repRange: { min: 10, max: 15 }, equipment: "machine", category: "isolation" }, // assumption
  // TODO: what is "Hips superset"? One machine (abduction/adduction) or two moves? If two, which, and does it count as one exercise or two?
  { id: id.hipsSuperset, name: "Hips superset", sets: 2, repRange: { min: 15, max: 20 }, equipment: "machine", category: "isolation" }, // assumption
  { id: id.calfRaises, name: "Calf raises", sets: 4, repRange: { min: 10, max: 15 }, equipment: "machine", category: "isolation" }, // assumption
  // Push
  { id: id.benchPress, name: "Bench press", sets: 3, repRange: { min: 8, max: 10 }, equipment: "barbell", category: "compound" }, // assumption
  { id: id.shoulderPress, name: "Shoulder press", sets: 3, repRange: { min: 10, max: 12 }, equipment: "dumbbell", category: "compound" }, // assumption
  { id: id.flies, name: "Flies", sets: 3, repRange: { min: 15, max: 20 }, equipment: "dumbbell", category: "isolation" }, // assumption
  { id: id.latRaises, name: "Lat raises", sets: 3, repRange: { min: 10, max: 15 }, equipment: "dumbbell", category: "isolation" }, // assumption
  { id: id.overheadTriceps, name: "Overhead triceps", sets: 3, repRange: { min: 5, max: 10 }, equipment: "cable", category: "isolation" }, // assumption
  { id: id.cableKickback, name: "Cable kickback", sets: 3, repRange: { min: 10, max: 15 }, equipment: "cable", category: "isolation" }, // assumption
  // Pull
  { id: id.closeGripLatPulldown, name: "Close grip lat pulldown", sets: 3, repRange: { min: 10, max: 15 }, equipment: "cable", category: "compound" }, // assumption
  { id: id.chestSupportedRow, name: "Chest supported row", sets: 3, repRange: { min: 8, max: 10 }, equipment: "machine", category: "compound" }, // assumption
  { id: id.closeGripRow, name: "Close grip row", sets: 2, repRange: { min: 15, max: 20 }, equipment: "cable", category: "compound" }, // assumption
  // TODO: "Cable flies" sits on the pull day. Is it a rear-delt (reverse) fly? Push has its own "Flies".
  { id: id.cableFlies, name: "Cable flies", sets: 3, repRange: { min: 15, max: 20 }, equipment: "cable", category: "isolation" }, // assumption
  { id: id.shrugs, name: "Shrugs", sets: 4, repRange: { min: 15, max: 20 }, equipment: "dumbbell", category: "isolation" }, // assumption
  { id: id.ezCurl, name: "EZ curl", sets: 3, repRange: { min: 10, max: 15 }, equipment: "barbell", category: "isolation" }, // assumption
  { id: id.preacherCurls, name: "Preacher curls", sets: 3, repRange: { min: 15, max: 20 }, equipment: "machine", category: "isolation" }, // assumption
];

export const pplDays: Readonly<Record<"push" | "pull" | "legs", readonly ExerciseId[]>> = {
  legs: [id.legCurl, id.smithSquat, id.romanianDeadlift, id.legExtensions, id.hipsSuperset, id.calfRaises],
  push: [id.benchPress, id.shoulderPress, id.flies, id.latRaises, id.overheadTriceps, id.cableKickback],
  pull: [id.closeGripLatPulldown, id.chestSupportedRow, id.closeGripRow, id.cableFlies, id.shrugs, id.ezCurl, id.preacherCurls],
};

// TODO: which antagonist pairs make up the supersets? The source plan
// is push/pull/legs and names no pairings (e.g. is bench press paired with chest supported row?).
export const supersets: readonly Superset[] = [];

// TODO: which moves go on full-body days A, B and C, in what order,
// and how do the supersets above spread across them to fit ~45 minutes?
export const abcSplit: Readonly<Record<SessionLetter, PlanDay>> = {
  A: { letter: "A", blocks: [] },
  B: { letter: "B", blocks: [] },
  C: { letter: "C", blocks: [] },
};

export const plan: Plan = {
  catalog,
  days: abcSplit,
  bridgeSwaps: [{ from: id.romanianDeadlift, to: id.legCurl }],
};
