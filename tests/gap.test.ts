import { describe, expect, test } from "bun:test";
import { nextSession } from "../src/engine/index.ts";
import type { ExerciseId, LoggedSession, Mode, SessionLetter } from "../src/engine/types.ts";
import { fixturePlan, ids } from "./fixtures/plan.ts";
import { day, ex, same, session, sets } from "./fixtures/history.ts";
import { pick } from "./helpers.ts";

const inRange = (w: number) => sets([w, 9, 2], [w, 9, 2], [w, 9, 2]);
const miss = (w: number) => sets([w, 8, 1], [w, 8, 0], [w, 7, 0]);
const benchOn = (n: number, s: ReturnType<typeof sets>): LoggedSession => session(day(n), "C", [ex(ids.bench, s)]);
const at = (...days: number[]): LoggedSession[] => days.map((n) => session(day(n), "C"));

describe("gap since the last session", () => {
  const cases: ReadonlyArray<{ gap: number; mode: Mode; sets: number; weight: number }> = [
    { gap: 0, mode: "normal", sets: 3, weight: 60 },
    { gap: 6, mode: "normal", sets: 3, weight: 60 },
    { gap: 7, mode: "deload", sets: 2, weight: 54 },
    { gap: 13, mode: "deload", sets: 2, weight: 54 },
    { gap: 14, mode: "bridge", sets: 2, weight: 47.5 },
    { gap: 40, mode: "bridge", sets: 2, weight: 47.5 },
  ];

  for (const c of cases) {
    test(`day ${c.gap} -> ${c.mode}`, () => {
      const p = nextSession([benchOn(0, inRange(60))], fixturePlan, day(c.gap));
      expect(p.mode).toBe(c.mode);
      expect(pick(p, ids.bench)).toMatchObject({ targetSets: c.sets, weight: c.weight });
    });
  }

  test("counts calendar days across a month and year boundary", () => {
    const history = [{ ...session(day(0), "C"), date: "2025-12-28" as LoggedSession["date"] }];
    expect(nextSession(history, fixturePlan, "2026-01-03" as LoggedSession["date"]).mode).toBe("normal");
    expect(nextSession(history, fixturePlan, "2026-01-04" as LoggedSession["date"]).mode).toBe("deload");
  });
});

describe("deload: one set fewer (min 1), 10% lighter rounded down to the increment", () => {
  const cases: ReadonlyArray<{ name: string; id: ExerciseId; loggedOn: SessionLetter; history: ReturnType<typeof sets>; sets: number; weight: number | null }> = [
    { name: "barbell 60 -> 54 exactly", id: ids.bench, loggedOn: "C", history: inRange(60), sets: 2, weight: 54 },
    { name: "barbell 62.5 -> 56.25 rounds down to 55", id: ids.bench, loggedOn: "C", history: inRange(62.5), sets: 2, weight: 55 },
    { name: "deloads from the progressed weight: 60 top -> 62.5 -> 55", id: ids.bench, loggedOn: "C", history: same(3, 60, 10, 2), sets: 2, weight: 55 },
    { name: "dumbbell 15 -> 13.5 rounds down to 12", id: ids.raise, loggedOn: "A", history: same(2, 15, 16, 2), sets: 1, weight: 12 },
    { name: "1-set exercise stays at 1 set; machine 20 -> 18 rounds to 17.5", id: ids.calf, loggedOn: "A", history: same(1, 20, 12, 2), sets: 1, weight: 17.5 },
    { name: "never logged stays null", id: ids.squat, loggedOn: "A", history: [], sets: 2, weight: null },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const history = [session(day(0), c.loggedOn, c.history.length ? [ex(c.id, c.history)] : [])];
      const p = nextSession(history, fixturePlan, day(7));
      expect(p.mode).toBe("deload");
      expect(pick(p, c.id)).toMatchObject({ targetSets: c.sets, weight: c.weight });
    });
  }

  test("deload aims for the bottom of the range", () => {
    const p = nextSession([benchOn(0, sets([60, 10, 2], [60, 10, 2], [60, 9, 2]))], fixturePlan, day(7));
    expect(pick(p, ids.bench).targetReps).toBe(8);
  });
});

describe("bridge prescription", () => {
  const curlLog = ex(ids.curl, same(3, 20, 12, 2));

  test("day A: 2 sets, compounds at RPE 5 and 80%, RDL swapped for leg curl", () => {
    const history = [session(day(0), "C", [ex(ids.bench, inRange(60)), curlLog])];
    const p = nextSession(history, fixturePlan, day(14));
    expect(p.mode).toBe("bridge");
    expect(p.exercises.map((e) => e.exerciseId)).toEqual([ids.bench, ids.row, ids.curl]);
    expect(pick(p, ids.bench)).toMatchObject({ targetSets: 2, targetRpe: 5, weight: 47.5, targetReps: 8 });
    expect(pick(p, ids.row)).toMatchObject({ targetSets: 2, targetRpe: 5, weight: null });
    const swapped = pick(p, ids.curl);
    expect(swapped).toMatchObject({ name: "Curl", substitutedFrom: ids.rdl, repRange: { min: 10, max: 15 }, targetSets: 2, weight: 17.5 });
    expect(swapped.targetRpe).toBeUndefined();
  });

  test("day B: isolations 90% with no RPE target; never more sets than the plan", () => {
    const history = [session(day(0), "A", [ex(ids.raise, same(2, 15, 16, 2)), ex(ids.calf, same(1, 20, 12, 2))])];
    const p = nextSession(history, fixturePlan, day(20));
    expect(p.mode).toBe("bridge");
    expect(pick(p, ids.squat)).toMatchObject({ targetSets: 2, targetRpe: 5, weight: null });
    const raise = pick(p, ids.raise);
    expect(raise).toMatchObject({ targetSets: 2, weight: 12 });
    expect(raise.targetRpe).toBeUndefined();
    expect(pick(p, ids.calf)).toMatchObject({ targetSets: 1, weight: 17.5 });
  });

  test("day C: swapping RDL into a day that already has leg curl does not duplicate it", () => {
    const p = nextSession([session(day(0), "B")], fixturePlan, day(14));
    expect(p.exercises.map((e) => e.exerciseId)).toEqual([ids.curl]);
    expect(pick(p, ids.curl).substitutedFrom).toBeUndefined();
  });

  test("normal sessions carry no RPE target and no substitution", () => {
    const p = nextSession([session(day(0), "C")], fixturePlan, day(2));
    for (const e of p.exercises) {
      expect(e.targetRpe).toBeUndefined();
      expect(e.substitutedFrom).toBeUndefined();
    }
  });
});

describe("bridge window: 14 days from the first session after a >=14 day gap", () => {
  const cases: ReadonlyArray<{ name: string; sessions: number[]; today: number; mode: Mode }> = [
    { name: "first ever session is not a bridge start", sessions: [0], today: 3, mode: "normal" },
    { name: "return on bridge day 3", sessions: [0, 20], today: 23, mode: "bridge" },
    { name: "return on bridge day 10 (gap 10 would be deload) stays bridge", sessions: [0, 20], today: 30, mode: "bridge" },
    { name: "bridge day 13 is still bridge", sessions: [0, 20, 27], today: 33, mode: "bridge" },
    { name: "bridge day 14 is normal", sessions: [0, 20, 27], today: 34, mode: "normal" },
    { name: "a new 14-day gap restarts the bridge", sessions: [0, 20], today: 34, mode: "bridge" },
    { name: "after the bridge ends, a 7-13 day gap deloads again", sessions: [0, 20, 27], today: 38, mode: "deload" },
    { name: "a new >=14 gap after a bridge restarts it: day 10 of the new bridge", sessions: [0, 20, 27, 47], today: 57, mode: "bridge" },
    { name: "a 7-13 day gap after a bridge does not restart it", sessions: [0, 20, 27, 40], today: 42, mode: "normal" },
  ];

  for (const c of cases) {
    test(c.name, () => {
      expect(nextSession(at(...c.sessions), fixturePlan, day(c.today)).mode).toBe(c.mode);
    });
  }
});

describe("bridge and deload sessions do not count toward progression", () => {
  const cases: ReadonlyArray<{ name: string; history: LoggedSession[]; today: number; weight: number; targetReps: number }> = [
    {
      name: "misses during a bridge do not extend a miss streak",
      history: [benchOn(0, miss(60)), benchOn(20, miss(40)), benchOn(27, miss(40))],
      today: 34,
      weight: 60,
      targetReps: 8,
    },
    {
      name: "top-of-range bridge sessions do not progress; the pre-bridge weight resumes",
      history: [benchOn(0, inRange(60)), benchOn(20, same(3, 42.5, 10, 2)), benchOn(27, same(3, 42.5, 10, 2))],
      today: 34,
      weight: 60,
      targetReps: 10,
    },
    {
      name: "a top-of-range deload session does not progress",
      history: [benchOn(0, inRange(60)), benchOn(10, same(2, 54, 10, 2))],
      today: 12,
      weight: 60,
      targetReps: 10,
    },
    {
      name: "a missed deload session does not count as a miss",
      history: [benchOn(0, miss(60)), benchOn(10, miss(54))],
      today: 12,
      weight: 60,
      targetReps: 8,
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const p = nextSession(c.history, fixturePlan, day(c.today));
      expect(p.mode).toBe("normal");
      expect(pick(p, ids.bench)).toMatchObject({ weight: c.weight, targetReps: c.targetReps });
    });
  }
});
