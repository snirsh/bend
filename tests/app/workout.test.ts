import { describe, expect, test } from "bun:test";
import { nextSession } from "../../src/engine/index.ts";
import type { LoggedSession, LoggedSet } from "../../src/engine/types.ts";
import { type InProgress, logSet, setRoughNight, startWorkout, toLoggedSession, upNext } from "../../src/app/workout.ts";
import { day, ex, same, session, sets } from "../fixtures/history.ts";
import { fixturePlan, ids } from "../fixtures/plan.ts";

const start = (history: readonly LoggedSession[], today: number): InProgress =>
  startWorkout(nextSession(history, fixturePlan, day(today)), fixturePlan);

/** Each slot as "<exercise><set number>", e.g. "bench1". */
const slots = (s: InProgress): string[] => s.order.map(({ exerciseId, setIndex }) => `${exerciseId}${setIndex + 1}`);

const logAll = (s: InProgress, ...logged: LoggedSet[]): InProgress => logged.reduce(logSet, s);

const set = (weight: number, reps: number, rir: number): LoggedSet => ({ weight, reps, rir });

describe("set order", () => {
  test("a superset interleaves A1, B1, A2, B2, then straight sets follow", () => {
    const s = start([], 0);
    expect(slots(s)).toEqual(["bench1", "row1", "bench2", "row2", "bench3", "row3", "rdl1", "rdl2", "rdl3"]);
    expect(s.order.map((o) => o.block)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1]);
  });

  test("with unequal set counts the shorter exercise stops and the longer one carries on", () => {
    const s = start([session(day(0), "A")], 1);
    expect(s.prescription.letter).toBe("B");
    expect(slots(s)).toEqual(["squat1", "raise1", "squat2", "raise2", "squat3", "calf1"]);
  });

  test("in a bridge, the swapped-in exercise takes the place of the one it replaces", () => {
    const s = start([session(day(0), "C")], 20);
    expect(s.prescription).toMatchObject({ letter: "A", mode: "bridge" });
    expect(slots(s)).toEqual(["bench1", "row1", "bench2", "row2", "curl1", "curl2"]);
  });

  test("a bridge swap onto an exercise already on the day leaves that exercise as straight sets", () => {
    const s = start([session(day(0), "B")], 20);
    expect(s.prescription).toMatchObject({ letter: "C", mode: "bridge" });
    expect(slots(s)).toEqual(["curl1", "curl2"]);
    expect(s.order.map((o) => o.block)).toEqual([0, 0]);
  });
});

describe("logging", () => {
  test("each logged set advances to the next slot, and nothing is up next once all are logged", () => {
    const s = start([session(day(0), "A")], 1);
    expect(upNext(s, [])?.slot).toEqual({ exerciseId: ids.squat, setIndex: 0, block: 0 });
    const two = logAll(s, set(80, 8, 2));
    expect(upNext(two, [])?.slot).toEqual({ exerciseId: ids.raise, setIndex: 0, block: 0 });
    const done = logAll(two, set(10, 15, 2), set(80, 8, 2), set(10, 15, 2), set(80, 7, 1), set(40, 12, 2));
    expect(upNext(done, [])).toBeNull();
    expect(logSet(done, set(80, 8, 2))).toEqual(done);
  });

  test.each([
    ["zero weight", set(0, 8, 2)],
    ["negative weight", set(-20, 8, 2)],
    ["fractional reps", set(60, 7.5, 2)],
    ["RIR above 10", set(60, 8, 11)],
  ])("a set the engine would reject (%s) is refused", (_label, bad) => {
    expect(() => logSet(start([], 0), bad)).toThrow(RangeError);
  });
});

describe("prefill and last values", () => {
  const history: LoggedSession[] = [
    session(day(0), "A", [ex(ids.bench, same(2, 55, 10, 2)), ex(ids.row, same(3, 50, 12, 2))]),
    session(day(2), "B"),
    session(day(4), "C"),
    session(day(6), "A", [ex(ids.bench, sets([60, 10, 2], [60, 9, 2], [60, 8, 1]))]),
    session(day(8), "B"),
    session(day(10), "C"),
  ];

  test("an exercise never logged has no weight and aims for the range bottom", () => {
    const first = upNext(start([], 0), []);
    expect(first).toMatchObject({ weight: null, reps: 8, last: null });
    expect(first?.exercise.name).toBe("Bench");
  });

  test("weight comes from the prescription; reps and last come from the same set last time", () => {
    const s = start(history, 12);
    expect(upNext(s, history)).toMatchObject({ weight: 60, reps: 10, last: { weight: 60, reps: 10, rir: 2 } });
    const benchSet3 = logAll(s, set(60, 10, 2), set(52.5, 8, 2), set(60, 9, 2), set(52.5, 8, 2));
    expect(upNext(benchSet3, history)).toMatchObject({
      slot: { exerciseId: ids.bench, setIndex: 2 },
      weight: 60,
      reps: 8,
      last: { weight: 60, reps: 8, rir: 1 },
    });
  });

  test("the latest session that has the exercise supplies last, whatever the history order", () => {
    const shuffled = [...history].reverse();
    expect(upNext(start(shuffled, 12), shuffled)).toMatchObject({ reps: 10, last: { weight: 60, reps: 10, rir: 2 } });
  });

  test("an exercise skipped in recent sessions takes last from the latest session that has it", () => {
    const s = logAll(start(history, 12), set(60, 10, 2));
    expect(upNext(s, history)).toMatchObject({
      slot: { exerciseId: ids.row, setIndex: 0 },
      weight: 52.5,
      reps: 12,
      last: { weight: 50, reps: 12, rir: 2 },
    });
  });

  test("a set past last time's set count aims for the target reps and shows last time's final set", () => {
    const short: LoggedSession[] = [
      session(day(0), "A", [ex(ids.bench, sets([60, 9, 2], [60, 8, 1]))]),
      session(day(2), "B"),
      session(day(4), "C"),
    ];
    const benchSet3 = logAll(start(short, 6), set(60, 9, 2), set(40, 8, 2), set(60, 8, 1), set(40, 8, 2));
    expect(upNext(benchSet3, short)).toMatchObject({
      slot: { exerciseId: ids.bench, setIndex: 2 },
      reps: 9,
      last: { weight: 60, reps: 8, rir: 1 },
    });
  });

  test("weight follows the last set logged this session for that exercise", () => {
    const s = logAll(start(history, 12), set(62.5, 9, 2), set(52.5, 8, 2));
    expect(upNext(s, history)).toMatchObject({ slot: { exerciseId: ids.bench, setIndex: 1 }, weight: 62.5 });
  });
});

describe("finishing", () => {
  test("only exercises with logged sets reach the session, sets in order", () => {
    const s = logAll(start([], 0), set(60, 8, 2), set(50, 10, 2), set(60, 7, 1));
    expect(toLoggedSession(s)).toEqual({
      date: day(0),
      letter: "A",
      exercises: [
        { exerciseId: ids.bench, sets: [set(60, 8, 2), set(60, 7, 1)] },
        { exerciseId: ids.row, sets: [set(50, 10, 2)] },
      ],
      tags: [],
    });
  });

  test("a session with nothing logged is not a session", () => {
    expect(toLoggedSession(start([], 0))).toBeNull();
  });

  test("a bridge session logs the swapped-in exercise under its own id", () => {
    const s = logAll(start([session(day(0), "C")], 20), set(50, 8, 3), set(40, 8, 3), set(50, 8, 3), set(40, 8, 3), set(30, 10, 3));
    expect(toLoggedSession(s)?.exercises.map((e) => e.exerciseId)).toEqual([ids.bench, ids.row, ids.curl]);
  });

  test("the finished session is valid history for the engine and moves the rotation on", () => {
    const logged = toLoggedSession(logAll(start([], 0), set(60, 8, 2), set(50, 10, 2)));
    if (!logged) throw new Error("expected a session");
    const next = nextSession([logged], fixturePlan, day(2));
    expect(next.letter).toBe("B");
    expect(nextSession([logged, session(day(2), "B"), session(day(4), "C")], fixturePlan, day(6)).exercises[0]).toMatchObject({
      exerciseId: ids.bench,
      weight: 60,
    });
  });

  test("the rough-night switch tags the session once and can be turned off", () => {
    const s = logAll(start([], 0), set(60, 8, 2));
    const on = setRoughNight(setRoughNight(s, true), true);
    expect(toLoggedSession(on)?.tags).toEqual(["rough-night"]);
    expect(toLoggedSession(setRoughNight(on, false))?.tags).toEqual([]);
  });
});
