import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import rowFile from "../../src/moves/chest-supported-row.json";
import squatFile from "../../src/moves/smith-squat.json";
import { MoveError, parseMove } from "../../src/moves/validate.ts";

const MOVES = new URL("../../src/moves/", import.meta.url);
const shipped = readdirSync(MOVES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ id: f.slice(0, -".json".length), raw: JSON.parse(readFileSync(new URL(f, MOVES), "utf8")) as unknown }));

type Draft = Record<string, any>;
const squat = () => structuredClone(squatFile) as Draft;
const row = () => structuredClone(rowFile) as Draft;

/** The error parseMove throws for `raw`, or undefined when it parses. */
const rejection = (raw: unknown, fileId = "smith-squat") => {
  try {
    parseMove(raw, fileId);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("every shipped move file", () => {
  test.each(shipped.map((m) => [m.id, m.raw] as const))("%s parses to itself", (id, raw) => {
    expect(parseMove(raw, id)).toEqual(raw as never);
  });
});

describe("a valid move", () => {
  test("may have box props, with or without a tilt", () => {
    const raw = squat();
    raw.props.push({ kind: "box", at: [0, 20, 0], size: [120, 10, 30] }, { kind: "box", at: [10, 40, 0], size: [40, 5, 30], tilt: -20 });
    expect(parseMove(raw, "smith-squat")).toEqual(raw as never);
  });

  test("may leave out the anchor", () => {
    const raw = squat();
    delete raw.anchor;
    expect(parseMove(raw, "smith-squat")).toEqual(raw as never);
  });
});

// One mutation of the shipped squat per row, and the path parseMove must blame.
const bad: [string, (m: Draft) => unknown, string][] = [
  ["a required field is missing", (m) => delete m.steps, "steps"],
  ["a field is unknown", (m) => (m.speed = 2), "speed"],
  ["the id is not the file name", (m) => (m.id = "bench-press"), "id"],
  ["the id is not a string", (m) => (m.id = 7), "id"],
  ["the view is not side", (m) => (m.view = "front"), "view"],
  ["the camera yaw is not a number", (m) => (m.camera.yaw = "-25"), "camera.yaw"],
  ["the camera yaw is not finite", (m) => (m.camera.yaw = Number.NaN), "camera.yaw"],
  ["the camera yaw is past 90", (m) => (m.camera.yaw = 91), "camera.yaw"],
  ["the camera yaw is past -90", (m) => (m.camera.yaw = -90.5), "camera.yaw"],
  ["the camera elevation is below -30", (m) => (m.camera.elevation = -31), "camera.elevation"],
  ["the camera elevation is above 60", (m) => (m.camera.elevation = 61), "camera.elevation"],
  ["the implement is unknown", (m) => (m.implement = "dumbbell"), "implement"],
  ["the loop is shorter than 1 s", (m) => (m.durationMs = 999), "durationMs"],
  ["the loop is longer than 10 s", (m) => (m.durationMs = 10_001), "durationMs"],
  ["there is one keyframe", (m) => (m.keyframes = m.keyframes.slice(0, 1)), "keyframes"],
  ["the first keyframe is not at t = 0", (m) => (m.keyframes[0].t = 0.01), "keyframes[0].t"],
  ["a keyframe time repeats", (m) => (m.keyframes[3].t = m.keyframes[2].t), "keyframes[3].t"],
  ["keyframe times go back", (m) => (m.keyframes[3].t = 0.05), "keyframes[3].t"],
  ["the last keyframe is at t = 1", (m) => (m.keyframes.at(-1).t = 1), "keyframes[11].t"],
  ["a keyframe has an unknown field", (m) => (m.keyframes[1].ease = "in"), "keyframes[1].ease"],
  ["a joint is missing", (m) => delete m.keyframes[2].joints.knee, "keyframes[2].joints.knee"],
  ["a joint is extra", (m) => (m.keyframes[2].joints.elbow = 10), "keyframes[2].joints.elbow"],
  ["a joint is past its range", (m) => (m.keyframes[2].joints.knee = 151), "keyframes[2].joints.knee"],
  ["a joint is below its range", (m) => (m.keyframes[2].joints.knee = -1), "keyframes[2].joints.knee"],
  ["a joint is not a number", (m) => (m.keyframes[2].joints.hip = null), "keyframes[2].joints.hip"],
  ["the root is not a pair", (m) => (m.keyframes[1].root = [1]), "keyframes[1].root"],
  ["the root has a string", (m) => (m.keyframes[1].root[0] = "0"), "keyframes[1].root[0]"],
  ["the bar is not finite", (m) => (m.keyframes[1].bar[1] = Number.POSITIVE_INFINITY), "keyframes[1].bar[1]"],
  ["the key pose is past the last keyframe", (m) => (m.keyPose = m.keyframes.length), "keyPose"],
  ["the key pose is negative", (m) => (m.keyPose = -1), "keyPose"],
  ["the key pose is not an integer", (m) => (m.keyPose = 1.5), "keyPose"],
  ["there are no steps", (m) => (m.steps = []), "steps"],
  ["a step names no keyframe", (m) => (m.steps[1].keyframe = 99), "steps[1].keyframe"],
  ["steps are out of order", (m) => m.steps.reverse(), "steps[1].keyframe"],
  ["a step label is empty", (m) => (m.steps[0].label = " "), "steps[0].label"],
  ["a step label is over 24 characters", (m) => (m.steps[0].label = "x".repeat(25)), "steps[0].label"],
  ["a step label is not a string", (m) => (m.steps[0].label = 1), "steps[0].label"],
  ["the anchor is not a heel", (m) => (m.anchor = "toe"), "anchor"],
  ["the grip half width is 0", (m) => (m.grip.halfWidth = 0), "grip.halfWidth"],
  ["the grip half width is over 60", (m) => (m.grip.halfWidth = 60.5), "grip.halfWidth"],
  ["the grip pole has two numbers", (m) => (m.grip.pole = [0, 1]), "grip.pole"],
  ["the grip pole has a string", (m) => (m.grip.pole[2] = "0"), "grip.pole[2]"],
  ["the props are not a list", (m) => (m.props = {}), "props"],
  ["a prop has an unknown kind", (m) => (m.props[0] = { kind: "rack", x: 1 }), "props[0].kind"],
  ["a prop has no kind", (m) => delete m.props[0].kind, "props[0].kind"],
  ["the floor has no height", (m) => delete m.props[0].y, "props[0].y"],
  ["the smith rail is not a number", (m) => (m.props[1].x = "7.5"), "props[1].x"],
  ["a prop has an extra field", (m) => (m.props[1].colour = "red"), "props[1].colour"],
  ["a box has a negative size", (m) => m.props.push({ kind: "box", at: [0, 0, 0], size: [-1, 1, 1] }), "props[2].size[0]"],
  ["a box is not placed", (m) => m.props.push({ kind: "box", size: [1, 1, 1] }), "props[2].at"],
  ["a box tilt is not finite", (m) => m.props.push({ kind: "box", at: [0, 0, 0], size: [1, 1, 1], tilt: Number.NaN }), "props[2].tilt"],
];

const outward = (p: number[], pivot: number[], by: number) => {
  const d = Math.hypot(p[0]! - pivot[0]!, p[1]! - pivot[1]!);
  return p.map((v, i) => v + ((v - pivot[i]!) / d) * by);
};

// One mutation of the shipped row, whose handles ride a lever, per row.
const badLever: [string, (m: Draft) => unknown, string][] = [
  ["the lever is not an object", (m) => (m.lever = 40), "lever"],
  ["the lever has no pivot", (m) => delete m.lever.pivot, "lever.pivot"],
  ["the lever has no length", (m) => delete m.lever.length, "lever.length"],
  ["the lever has an unknown field", (m) => (m.lever.mass = 5), "lever.mass"],
  ["the lever pivot is not a pair", (m) => (m.lever.pivot = [1, 2, 3]), "lever.pivot"],
  ["the lever pivot has a string", (m) => (m.lever.pivot[0] = "40"), "lever.pivot[0]"],
  ["the lever length is not finite", (m) => (m.lever.length = Number.NaN), "lever.length"],
  ["the lever is shorter than 10 cm", (m) => (m.lever.length = 9.5), "lever.length"],
  ["the lever is longer than 200 cm", (m) => (m.lever.length = 200.5), "lever.length"],
  ["a barbell rides the lever", (m) => (m.implement = "barbell"), "lever"],
  // 1 cm straight out from the pivot.
  ["a handle leaves the lever's arc", (m) => (m.keyframes[3].bar = outward(m.keyframes[3].bar, m.lever.pivot, 1)), "keyframes[3].bar"],
  ["the lever is longer than the handles sit from the pivot", (m) => (m.lever.length += 1), "keyframes[0].bar"],
];

describe("parseMove rejects a file when", () => {
  test.each(bad)("%s", (_, mutate, path) => {
    const raw = squat();
    mutate(raw);
    const error = rejection(raw);
    expect(error).toBeInstanceOf(MoveError);
    expect((error as MoveError).path).toBe(path);
  });

  test.each(badLever)("%s", (_, mutate, path) => {
    const raw = row();
    mutate(raw);
    const error = rejection(raw, "chest-supported-row");
    expect(error).toBeInstanceOf(MoveError);
    expect((error as MoveError).path).toBe(path);
  });

  test.each([[null], [[squatFile]], ["smith-squat"]])("the file is %p, not an object", (raw) => {
    expect(rejection(raw)).toBeInstanceOf(MoveError);
  });

  test("the id is not in the catalog, even when it matches the file name", () => {
    const raw = squat();
    raw.id = "goblet-squat";
    const error = rejection(raw, "goblet-squat");
    expect(error).toBeInstanceOf(MoveError);
    expect((error as MoveError).path).toBe("id");
  });
});
