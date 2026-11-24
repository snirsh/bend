import { describe, expect, test } from "bun:test";
import { COOLDOWN_MS, REST_MS, idle, parseTimers, pause, resume, skip, start, view } from "../../src/app/timer.ts";

const T0 = 1_790_000_000_000;

describe("timer", () => {
  test("rest defaults to 2:00 and cooldown to 5:00", () => {
    expect(REST_MS).toBe(120_000);
    expect(COOLDOWN_MS).toBe(300_000);
  });

  test("an idle timer shows its full duration and is not done", () => {
    expect(view(idle(REST_MS), T0)).toEqual({ kind: "idle", remainingMs: 120_000, done: false });
  });

  test("a started timer counts down from the full duration", () => {
    const t = start(idle(REST_MS), T0);
    expect(view(t, T0)).toEqual({ kind: "running", remainingMs: 120_000, done: false });
    expect(view(t, T0 + 1_000).remainingMs).toBe(119_000);
  });

  test("after a 90 s gap with no calls in between, 30 s of 2:00 remain", () => {
    const t = start(idle(REST_MS), T0);
    expect(view(t, T0 + 90_000)).toEqual({ kind: "running", remainingMs: 30_000, done: false });
  });

  test("an end in the past shows 0 and done", () => {
    const t = start(idle(REST_MS), T0);
    expect(view(t, T0 + 120_000)).toEqual({ kind: "running", remainingMs: 0, done: true });
    expect(view(t, T0 + 3_600_000)).toEqual({ kind: "running", remainingMs: 0, done: true });
  });

  test("pause freezes the remaining time and resume counts down from it", () => {
    const paused = pause(start(idle(REST_MS), T0), T0 + 30_000);
    expect(view(paused, T0 + 30_000)).toEqual({ kind: "paused", remainingMs: 90_000, done: false });
    expect(view(paused, T0 + 600_000).remainingMs).toBe(90_000);

    const resumed = resume(paused, T0 + 600_000);
    expect(view(resumed, T0 + 660_000)).toEqual({ kind: "running", remainingMs: 30_000, done: false });
    expect(view(resumed, T0 + 690_000).done).toBe(true);
  });

  test("skip returns a running or paused timer to idle with the same duration", () => {
    const running = start(idle(COOLDOWN_MS), T0);
    expect(view(skip(running), T0 + 5_000)).toEqual({ kind: "idle", remainingMs: 300_000, done: false });
    expect(view(skip(pause(running, T0 + 5_000)), T0 + 9_000)).toEqual({ kind: "idle", remainingMs: 300_000, done: false });
  });

  test("starting a running timer restarts it from the full duration", () => {
    const restarted = start(start(idle(REST_MS), T0), T0 + 100_000);
    expect(view(restarted, T0 + 100_000).remainingMs).toBe(120_000);
  });

  test("pausing a finished timer keeps it done", () => {
    const finished = start(idle(REST_MS), T0);
    expect(view(pause(finished, T0 + 200_000), T0 + 200_000)).toEqual({ kind: "running", remainingMs: 0, done: true });
  });

  test("pause on an idle timer and resume on a running one change nothing", () => {
    expect(view(pause(idle(REST_MS), T0), T0 + 1_000)).toEqual({ kind: "idle", remainingMs: 120_000, done: false });
    const running = start(idle(REST_MS), T0);
    expect(view(resume(running, T0 + 50_000), T0 + 60_000).remainingMs).toBe(60_000);
  });

  describe("clock going backwards", () => {
    test("never shows more than the duration", () => {
      const t = start(idle(REST_MS), T0);
      expect(view(t, T0 - 60_000)).toEqual({ kind: "running", remainingMs: 120_000, done: false });
    });

    test("after a resume, never shows more than was left when it resumed", () => {
      const t = resume(pause(start(idle(REST_MS), T0), T0 + 90_000), T0 + 100_000);
      expect(view(t, T0 + 40_000).remainingMs).toBe(30_000);
    });
  });
});

describe("parseTimers", () => {
  const fresh = { rest: idle(REST_MS), cooldown: idle(COOLDOWN_MS) };

  test("a stored running rest timer survives a reload", () => {
    const timers = { rest: start(idle(REST_MS), T0), cooldown: pause(start(idle(COOLDOWN_MS), T0), T0 + 60_000) };
    const back = parseTimers(JSON.stringify(timers));
    expect(back).toEqual(timers);
    expect(view(back.rest, T0 + 90_000).remainingMs).toBe(30_000);
    expect(view(back.cooldown, T0 + 900_000).remainingMs).toBe(240_000);
  });

  test.each([
    ["nothing stored", null],
    ["empty string", ""],
    ["not JSON", "{rest: oops"],
    ["JSON null", "null"],
    ["a number", "42"],
    ["an array", "[1, 2]"],
    ["unknown kind", JSON.stringify({ rest: { kind: "ticking", durationMs: 120_000 }, cooldown: 1 })],
    ["running without timestamps", JSON.stringify({ rest: { kind: "running", durationMs: 120_000 } })],
    ["timestamps as strings", JSON.stringify({ rest: { kind: "running", durationMs: 120_000, startedAt: "1", endsAt: "2" } })],
    ["zero duration", JSON.stringify({ rest: { kind: "idle", durationMs: 0 } })],
    ["negative duration", JSON.stringify({ rest: { kind: "idle", durationMs: -5 } })],
    ["ends before it started", JSON.stringify({ rest: { kind: "running", durationMs: 120_000, startedAt: T0, endsAt: T0 - 1 } })],
    ["runs longer than its duration", JSON.stringify({ rest: { kind: "running", durationMs: 120_000, startedAt: T0, endsAt: T0 + 120_001 } })],
    ["paused with more left than its duration", JSON.stringify({ rest: { kind: "paused", durationMs: 120_000, remainingMs: 120_001 } })],
  ])("corrupt input (%s) falls back to idle timers", (_label, text) => {
    expect(parseTimers(text)).toEqual(fresh);
  });

  test("one corrupt timer does not reset the other", () => {
    const rest = start(idle(REST_MS), T0);
    expect(parseTimers(JSON.stringify({ rest, cooldown: { kind: "paused" } }))).toEqual({ rest, cooldown: idle(COOLDOWN_MS) });
  });
});
