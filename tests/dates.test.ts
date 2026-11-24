import { describe, expect, test } from "bun:test";
import { calendarDate, nextSession } from "../src/engine/index.ts";
import { fixturePlan } from "./fixtures/plan.ts";
import { day, session } from "./fixtures/history.ts";

describe("calendarDate", () => {
  const valid = ["2026-01-01", "2024-02-29", "2026-12-31", "1900-01-01", "9999-12-31"];
  const invalid = ["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-1", "2026-01-01T00:00:00Z", "", "tomorrow", "0001-01-01", "0099-12-31", "0000-01-01", "1899-12-31"];

  for (const s of valid) test(`accepts ${s}`, () => expect(String(calendarDate(s))).toBe(s));
  for (const s of invalid) test(`rejects "${s}"`, () => expect(() => calendarDate(s)).toThrow(RangeError));
});

test("today before the last session is rejected", () => {
  expect(() => nextSession([session(day(5), "A")], fixturePlan, day(4))).toThrow(RangeError);
});
