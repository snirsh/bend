import { describe, expect, test } from "bun:test";
import { nextSession } from "../src/engine/index.ts";
import type { LoggedSession, SessionLetter } from "../src/engine/types.ts";
import { fixturePlan, ids } from "./fixtures/plan.ts";
import { day, session } from "./fixtures/history.ts";

describe("session letter", () => {
  const cases: ReadonlyArray<{ name: string; history: LoggedSession[]; today: number; letter: SessionLetter }> = [
    { name: "empty history starts at A", history: [], today: 0, letter: "A" },
    { name: "A -> B", history: [session(day(0), "A")], today: 2, letter: "B" },
    { name: "B -> C", history: [session(day(0), "B")], today: 2, letter: "C" },
    { name: "C wraps to A", history: [session(day(0), "C")], today: 2, letter: "A" },
    { name: "follows the last session, not the count", history: [session(day(0), "A"), session(day(1), "B")], today: 2, letter: "C" },
    { name: "same-day sessions never double up", history: [session(day(0), "A"), session(day(0), "B")], today: 0, letter: "C" },
    { name: "same-day sessions keep input order: B then A -> B", history: [session(day(0), "B"), session(day(0), "A")], today: 0, letter: "B" },
    { name: "same-day tie-break survives other dates around it", history: [session(day(1), "C"), session(day(0), "B"), session(day(1), "A")], today: 2, letter: "B" },
    { name: "history order does not matter, dates do", history: [session(day(1), "B"), session(day(0), "A")], today: 2, letter: "C" },
    { name: "rotation continues across a long gap", history: [session(day(0), "A")], today: 30, letter: "B" },
    { name: "rotation continues across a rough night", history: [session(day(0), "A", [], ["rough-night"])], today: 2, letter: "B" },
  ];

  for (const c of cases) {
    test(c.name, () => {
      expect(nextSession(c.history, fixturePlan, day(c.today)).letter).toBe(c.letter);
    });
  }

  test("prescribes the plan day's exercises in block order and echoes today", () => {
    const p = nextSession([session(day(0), "C")], fixturePlan, day(2));
    expect(p.date).toBe(day(2));
    expect(p.exercises.map((e) => e.exerciseId)).toEqual([ids.bench, ids.row, ids.rdl]);
  });
});
