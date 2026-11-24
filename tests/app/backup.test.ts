import { describe, expect, test } from "bun:test";
import type { LoggedSession } from "../../src/engine/types.ts";
import { mergeHistory, parseBackup, toBackup } from "../../src/app/backup.ts";
import { day, ex, rough, same, session, sets } from "../fixtures/history.ts";
import { ids } from "../fixtures/plan.ts";

const AT = "2026-11-24T10:00:00.000Z";

const a0 = session(day(0), "A", [ex(ids.bench, sets([60, 10, 2], [60, 9, 2])), ex(ids.row, same(3, 50, 12, 1))]);
const b2 = rough(day(2), "B", [ex(ids.squat, same(3, 80, 8, 2))]);
const c4 = session(day(4), "C", [ex(ids.curl, same(2, 30, 12, 0))]);
const history: LoggedSession[] = [a0, b2, c4];

/** Parsed JSON is untyped, so each case can break any one field. */
type Raw = any;

/** A valid exported file with one value changed, as raw JSON. */
const fileWith = (edit: (file: Raw) => void): string => {
  const file = JSON.parse(JSON.stringify(toBackup(history, AT)));
  edit(file);
  return JSON.stringify(file);
};

const rejected = (text: string): string => {
  const result = parseBackup(text);
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.error;
};

describe("export and import", () => {
  test("an exported file imports back to the same sessions", () => {
    expect(parseBackup(JSON.stringify(toBackup(history, AT)))).toEqual({
      ok: true,
      backup: { app: "bend", schemaVersion: 1, exportedAt: AT, sessions: history },
    });
  });

  test("an empty history round-trips", () => {
    expect(parseBackup(JSON.stringify(toBackup([], AT)))).toEqual({
      ok: true,
      backup: { app: "bend", schemaVersion: 1, exportedAt: AT, sessions: [] },
    });
  });

  test("a file from another schema version is rejected, naming the version", () => {
    expect(rejected(fileWith((f) => (f.schemaVersion = 2)))).toContain("version 2");
  });

  test.each([
    ["not JSON", "{ this is not json"],
    ["a JSON array", "[]"],
    ["another app's file", JSON.stringify({ app: "other", schemaVersion: 1, sessions: [] })],
    ["no sessions list", JSON.stringify({ app: "bend", schemaVersion: 1, exportedAt: AT })],
  ])("a file that is not a bend backup (%s) is rejected", (_label, text) => {
    expect(rejected(text)).toMatch(/bend backup/i);
  });

  test.each([
    ["a weight of 0", (s: Raw) => (s.exercises[0].sets[1].weight = 0), ["session 2", "set 2", "weight"]],
    ["negative weight", (s: Raw) => (s.exercises[0].sets[0].weight = -5), ["session 2", "weight"]],
    ["reps as text", (s: Raw) => (s.exercises[0].sets[0].reps = "8"), ["session 2", "reps"]],
    ["fractional reps", (s: Raw) => (s.exercises[0].sets[0].reps = 7.5), ["session 2", "reps"]],
    ["RIR 11", (s: Raw) => (s.exercises[0].sets[0].rir = 11), ["session 2", "RIR"]],
    ["an exercise with no sets", (s: Raw) => (s.exercises[0].sets = []), ["session 2", "squat", "set"]],
    ["an impossible date", (s: Raw) => (s.date = "2026-02-30"), ["session 2", "date"]],
    ["an unknown letter", (s: Raw) => (s.letter = "D"), ["session 2", "letter"]],
    ["an unknown tag", (s: Raw) => (s.tags = ["hungover"]), ["session 2", "tag"]],
    ["a missing exercise id", (s: Raw) => delete s.exercises[0].exerciseId, ["session 2", "exerciseId"]],
  ])("a bad session (%s) rejects the whole file, naming where", (_label, edit, mentions) => {
    const error = rejected(fileWith((f) => edit(f.sessions[1])));
    for (const m of mentions) expect(error).toContain(m);
  });
});

describe("mergeHistory", () => {
  test("never loses existing history and adds what is new, in date order", () => {
    const older = session(day(-3), "C", [ex(ids.calf, same(1, 40, 12, 2))]);
    const { merged, added, duplicates } = mergeHistory([a0, b2], [c4, older]);
    expect(merged).toEqual([older, a0, b2, c4]);
    expect(added).toEqual([c4, older]);
    expect(duplicates).toBe(0);
  });

  test("an exact duplicate is skipped; a session differing by one rep is kept", () => {
    const oneRepMore = session(day(0), "A", [ex(ids.bench, sets([60, 10, 2], [60, 10, 2])), ex(ids.row, same(3, 50, 12, 1))]);
    const result = mergeHistory(history, [a0, oneRepMore, b2]);
    expect(result.duplicates).toBe(2);
    expect(result.added).toEqual([oneRepMore]);
    expect(result.merged).toEqual([a0, oneRepMore, b2, c4]);
  });

  test("a rough-night tag makes a session distinct", () => {
    const sameButRough = rough(day(0), "A", a0.exercises.map((e) => ({ ...e })));
    expect(mergeHistory([a0], [sameButRough]).added).toEqual([sameButRough]);
  });

  test("the same session twice in one import is added once", () => {
    expect(mergeHistory([], [c4, c4])).toMatchObject({ added: [c4], duplicates: 1 });
  });

  test("a duplicate is found even when the file lists fields in another order", () => {
    const reordered = JSON.stringify({
      sessions: [{ tags: [], exercises: [{ sets: [{ rir: 0, reps: 12, weight: 30 }, { rir: 0, weight: 30, reps: 12 }], exerciseId: "curl" }], letter: "C", date: day(4) }],
      exportedAt: AT,
      schemaVersion: 1,
      app: "bend",
    });
    const parsed = parseBackup(reordered);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(mergeHistory(history, parsed.backup.sessions)).toMatchObject({ added: [], duplicates: 1, merged: history });
  });
});
