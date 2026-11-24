import { describe, expect, test } from "bun:test";
import { periodic } from "../../src/moves/sample.ts";

// A channel: keyframe times in [0, 1) and values; t = 1 wraps to the first keyframe.
const squatDepth = { ts: [0, 0.1, 0.5, 0.8], vs: [0, 0, 100, 40] };

describe("periodic monotone interpolation", () => {
  test.each(squatDepth.ts.map((t, i) => [t, squatDepth.vs[i]!]))("hits the keyframe at t = %p exactly", (t, v) => {
    expect(periodic(squatDepth.ts, squatDepth.vs, t)).toBe(v);
  });

  test.each([
    [1, 0],
    [2.5, 100],
    [-0.5, 100],
  ])("wraps t = %p to the same value as its fraction", (t, v) => {
    expect(periodic(squatDepth.ts, squatDepth.vs, t)).toBeCloseTo(v, 9);
  });

  test("the loop seam is continuous in value and slope", () => {
    const f = (t: number) => periodic(squatDepth.ts, squatDepth.vs, t);
    const h = 1e-5;
    expect(f(1 - h)).toBeCloseTo(f(0), 3);
    const slopeBefore = (f(1 - h) - f(1 - 2 * h)) / h;
    const slopeAfter = (f(2 * h) - f(h)) / h;
    expect(slopeBefore).toBeCloseTo(slopeAfter, 0);
  });

  test("never overshoots: every sample stays between its two keyframes", () => {
    const { ts, vs } = squatDepth;
    for (let i = 0; i < 1000; i++) {
      const t = i / 1000;
      const k = ts.length - 1 - [...ts].reverse().findIndex((x) => x <= t);
      const a = vs[k]!;
      const b = vs[(k + 1) % vs.length]!;
      const v = periodic(ts, vs, t);
      expect(v).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9);
      expect(v).toBeLessThanOrEqual(Math.max(a, b) + 1e-9);
    }
  });

  test("a hold between two equal keyframes stays perfectly still", () => {
    for (const t of [0.02, 0.05, 0.09]) expect(periodic(squatDepth.ts, squatDepth.vs, t)).toBe(0);
  });

  test("eases: it slows to a stop at a turnaround and moves fastest in between", () => {
    const f = (t: number) => periodic(squatDepth.ts, squatDepth.vs, t);
    const speed = (t: number) => Math.abs(f(t + 1e-4) - f(t - 1e-4)) / 2e-4;
    expect(speed(0.5)).toBeLessThan(1);
    expect(speed(0.3)).toBeGreaterThan(200);
  });

  test("a single keyframe is a constant", () => {
    expect(periodic([0], [7], 0.42)).toBe(7);
  });
});
