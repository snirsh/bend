import { describe, expect, test } from "bun:test";
import { abcSplit, catalog, plan, pplDays, supersets } from "../src/plan/plan.ts";

const ids = catalog.map((e) => e.id);
const known = new Set<string>(ids);

describe("plan.ts integrity", () => {
  test("exercise ids are unique", () => expect(new Set(ids).size).toBe(ids.length));

  test("every rep range has 1 <= min <= max and at least one set", () => {
    for (const e of catalog) {
      expect(e.repRange.min).toBeGreaterThanOrEqual(1);
      expect(e.repRange.min).toBeLessThanOrEqual(e.repRange.max);
      expect(e.sets).toBeGreaterThanOrEqual(1);
    }
  });

  test("catalog is exactly the 19 moves of the source plan", () => {
    expect(catalog.map((e) => e.name).sort()).toEqual(
      [
        "Leg curl", "Smith squat", "Romanian deadlift", "Leg extensions", "Hips superset", "Calf raises",
        "Bench press", "Shoulder press", "Flies", "Lat raises", "Overhead triceps", "Cable kickback",
        "Close grip lat pulldown", "Chest supported row", "Close grip row", "Cable flies", "Shrugs", "EZ curl", "Preacher curls",
      ].sort(),
    );
  });

  test("leg curl and Romanian deadlift both exist and the bridge swaps RDL for leg curl", () => {
    const byName = (n: string) => catalog.find((e) => e.name === n)?.id;
    expect(byName("Leg curl")).toBeDefined();
    expect(byName("Romanian deadlift")).toBeDefined();
    expect(plan.bridgeSwaps).toEqual([{ from: byName("Romanian deadlift")!, to: byName("Leg curl")! }]);
  });

  test("PPL days, A/B/C days and supersets only reference catalog ids", () => {
    const referenced = [
      ...pplDays.push, ...pplDays.pull, ...pplDays.legs,
      ...Object.values(abcSplit).flatMap((d) => d.blocks.flatMap((b) => (b.kind === "superset" ? [...b.exercises] : [b.exercise]))),
      ...supersets.flatMap((s) => [...s.exercises]),
    ];
    for (const id of referenced) expect(known.has(id)).toBe(true);
    expect(pplDays.push.length + pplDays.pull.length + pplDays.legs.length).toBe(catalog.length);
  });
});
