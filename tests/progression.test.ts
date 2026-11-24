import { describe, expect, test } from "bun:test";
import { nextSession } from "../src/engine/index.ts";
import type { ExerciseId, LoggedSession, SessionLetter } from "../src/engine/types.ts";
import { fixturePlan, ids } from "./fixtures/plan.ts";
import { day, ex, rough, same, session, sets } from "./fixtures/history.ts";
import type { LoggedSet } from "../src/engine/types.ts";
import { pick } from "./helpers.ts";

// Bench: barbell (+2.5 kg), 3 x 8-10, on day A. Sessions are logged as "C" so the next day is A.
const b = (n: number, s: ReturnType<typeof sets>): LoggedSession => session(day(n), "C", [ex(ids.bench, s)]);
const br = (n: number, s: ReturnType<typeof sets>): LoggedSession => rough(day(n), "C", [ex(ids.bench, s)]);

const top = (w: number) => same(3, w, 10, 2);
const inRange = (w: number) => sets([w, 9, 2], [w, 9, 2], [w, 9, 2]);
const miss = (w: number) => sets([w, 8, 1], [w, 8, 0], [w, 7, 0]);

describe("double progression (bench, barbell +2.5, 3x8-10)", () => {
  const cases: ReadonlyArray<{ name: string; history: LoggedSession[]; weight: number | null; targetReps: number }> = [
    { name: "never logged: no weight, bottom of range", history: [session(day(0), "C")], weight: null, targetReps: 8 },
    { name: "exactly top of range, RIR 2 on every set: add increment, reset to bottom", history: [b(0, top(60))], weight: 62.5, targetReps: 8 },
    { name: "top of range with RIR 0/1/2: add increment", history: [b(0, sets([60, 10, 0], [60, 10, 1], [60, 10, 2]))], weight: 62.5, targetReps: 8 },
    { name: "above top of range still progresses", history: [b(0, same(3, 60, 11, 2))], weight: 62.5, targetReps: 8 },
    { name: "top of range but one set at RIR 3: hold", history: [b(0, sets([60, 10, 2], [60, 10, 2], [60, 10, 3]))], weight: 60, targetReps: 10 },
    { name: "one rep short of top on one set: hold, aim for top", history: [b(0, sets([60, 10, 2], [60, 10, 2], [60, 9, 2]))], weight: 60, targetReps: 10 },
    { name: "inside the range: hold, aim one rep past the weakest set", history: [b(0, sets([60, 9, 2], [60, 8, 2], [60, 8, 2]))], weight: 60, targetReps: 9 },
    { name: "first miss (a set below bottom): hold", history: [b(0, miss(60))], weight: 60, targetReps: 8 },
    { name: "second miss in a row: step down one increment", history: [b(0, miss(60)), b(2, miss(60))], weight: 57.5, targetReps: 8 },
    { name: "rough night as the second miss: no step-down", history: [b(0, miss(60)), br(2, miss(60))], weight: 60, targetReps: 8 },
    { name: "rough night between two misses: streak continues", history: [b(0, miss(60)), br(2, miss(60)), b(4, miss(60))], weight: 57.5, targetReps: 8 },
    { name: "rough night at top of range between two misses: neither resets nor progresses", history: [b(0, miss(60)), br(2, top(60)), b(4, miss(60))], weight: 57.5, targetReps: 8 },
    { name: "an in-range session between misses resets the streak", history: [b(0, miss(60)), b(2, inRange(60)), b(4, miss(60))], weight: 60, targetReps: 8 },
    { name: "after a step-down the streak restarts: next miss holds", history: [b(0, miss(60)), b(2, miss(60)), b(4, miss(57.5))], weight: 57.5, targetReps: 8 },
    { name: "two more misses after a step-down step down again", history: [b(0, miss(60)), b(2, miss(60)), b(4, miss(57.5)), b(6, miss(57.5))], weight: 55, targetReps: 8 },
    { name: "first miss after a progression holds the new weight", history: [b(0, top(60)), b(2, miss(62.5))], weight: 62.5, targetReps: 8 },
    { name: "step-down never goes below one increment", history: [b(0, miss(3)), b(2, miss(3))], weight: 2.5, targetReps: 8 },
    { name: "step-down from under one increment holds", history: [b(0, miss(2)), b(2, miss(2))], weight: 2, targetReps: 8 },
    { name: "the logged weight wins over the previous prescription", history: [b(0, top(60)), b(2, inRange(65))], weight: 65, targetReps: 10 },
    { name: "working weight is the heaviest set", history: [b(0, sets([60, 10, 2], [60, 10, 2], [50, 10, 2]))], weight: 62.5, targetReps: 8 },
    { name: "only ever logged on a rough night: reuse that weight, bottom of range", history: [br(0, top(60))], weight: 60, targetReps: 8 },
    { name: "history order does not matter", history: [b(2, miss(60)), b(0, miss(60))], weight: 57.5, targetReps: 8 },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const last = c.history.map((s) => s.date).sort().at(-1) ?? day(0);
      const today = day(Math.round((Date.parse(last) - Date.parse(day(0))) / 86_400_000) + 2);
      const p = nextSession(c.history, fixturePlan, today);
      expect(p.mode).toBe("normal");
      const bench = pick(p, ids.bench);
      expect(bench.weight).toBe(c.weight);
      expect(bench.targetReps).toBe(c.targetReps);
      expect(bench.targetSets).toBe(3);
      expect(bench.repRange).toEqual({ min: 8, max: 10 });
    });
  }
});

describe("smallest increment per equipment kind", () => {
  const cases: ReadonlyArray<{ name: string; id: ExerciseId; loggedOn: SessionLetter; reps: number; from: number; to: number }> = [
    { name: "barbell +2.5", id: ids.bench, loggedOn: "C", reps: 10, from: 60, to: 62.5 },
    { name: "smith +2.5", id: ids.squat, loggedOn: "A", reps: 10, from: 40, to: 42.5 },
    { name: "cable +2.5", id: ids.row, loggedOn: "C", reps: 12, from: 30, to: 32.5 },
    { name: "machine +2.5", id: ids.curl, loggedOn: "B", reps: 15, from: 20, to: 22.5 },
    { name: "dumbbell +2 per hand", id: ids.raise, loggedOn: "A", reps: 20, from: 10, to: 12 },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const history = [session(day(0), c.loggedOn, [ex(c.id, same(3, c.from, c.reps, 2))])];
      expect(pick(nextSession(history, fixturePlan, day(2)), c.id).weight).toBe(c.to);
    });
  }
});

test("untouched exercises get no weight at the bottom of their range", () => {
  const p = nextSession([b(0, top(60))], fixturePlan, day(2));
  expect(pick(p, ids.row)).toMatchObject({ weight: null, targetReps: 8, targetSets: 3 });
  expect(pick(p, ids.rdl)).toMatchObject({ weight: null, targetReps: 5, targetSets: 3 });
});

describe("logged history is validated", () => {
  const set = (o: Partial<LoggedSet>): LoggedSet[] => [{ weight: 60, reps: 8, rir: 2, ...o }];
  const rejected: ReadonlyArray<{ name: string; sets: LoggedSet[] }> = [
    { name: "zero sets", sets: [] },
    { name: "weight 0", sets: set({ weight: 0 }) },
    { name: "negative weight", sets: set({ weight: -5 }) },
    { name: "NaN weight", sets: set({ weight: NaN }) },
    { name: "infinite weight", sets: set({ weight: Infinity }) },
    { name: "negative reps", sets: set({ reps: -1 }) },
    { name: "fractional reps", sets: set({ reps: 8.5 }) },
    { name: "NaN reps", sets: set({ reps: NaN }) },
    { name: "negative RIR", sets: set({ rir: -1 }) },
    { name: "fractional RIR", sets: set({ rir: 1.5 }) },
    { name: "RIR above 10", sets: set({ rir: 11 }) },
    { name: "NaN RIR", sets: set({ rir: NaN }) },
    { name: "one bad set among good ones", sets: [...top(60), ...set({ reps: -1 })] },
  ];

  for (const c of rejected) {
    test(`rejects ${c.name}`, () => {
      expect(() => nextSession([b(0, c.sets)], fixturePlan, day(2))).toThrow(RangeError);
    });
  }

  test("rejects a bad set in a rough-night session too", () => {
    expect(() => nextSession([br(0, set({ weight: 0 }))], fixturePlan, day(2))).toThrow(RangeError);
  });

  test("the error names the session date and exercise id", () => {
    expect(() => nextSession([b(0, top(60)), b(2, set({ weight: 0 }))], fixturePlan, day(4))).toThrow(
      new RegExp(`${day(2)}.*${ids.bench}`),
    );
  });

  const accepted: ReadonlyArray<{ name: string; sets: LoggedSet[] }> = [
    { name: "0 reps (a failed attempt)", sets: set({ reps: 0 }) },
    { name: "RIR 0", sets: set({ rir: 0 }) },
    { name: "RIR 10", sets: set({ rir: 10 }) },
    { name: "fractional weight", sets: set({ weight: 0.5 }) },
  ];

  for (const c of accepted) {
    test(`accepts ${c.name}`, () => {
      expect(() => nextSession([b(0, c.sets)], fixturePlan, day(2))).not.toThrow();
    });
  }
});
