/**
 * The boundary for move files: `parseMove` turns the raw JSON of `src/moves/<id>.json` into a
 * `Move`, or throws a `MoveError` naming the first field that is wrong. Pure, no DOM.
 */
import { catalog } from "../plan/plan.ts";
import type { Keyframe, Move, Prop } from "./sample.ts";
import { JOINTS, RANGES, type JointName, type Joints, type Vec2, type Vec3 } from "./skeleton.ts";

/** A move file that does not hold a playable move. `path` is the field, e.g. `keyframes[3].joints.knee`; "" is the whole file. */
export class MoveError extends Error {
  override readonly name = "MoveError";
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path || "file"}: ${reason}`);
  }
}

type Obj = Readonly<Record<string, unknown>>;
type Range = readonly [min: number, max: number];

const bad = (path: string, reason: string): never => {
  throw new MoveError(path, reason);
};
const at = (path: string, key: string | number) => (typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key);

/** An object with every `required` key, any of `optional`, and nothing else. */
const object = (v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Obj => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return bad(path, "not an object");
  for (const key of required) if (!Object.hasOwn(v, key)) bad(at(path, key), "missing");
  for (const key of Object.keys(v)) if (!required.includes(key) && !optional.includes(key)) bad(at(path, key), "unknown field");
  return v as Obj;
};

const num = (v: unknown, path: string, [min, max]: Range = [-Infinity, Infinity]) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return bad(path, "not a finite number");
  if (v < min || v > max) bad(path, `outside [${min}, ${max}]`);
  return v;
};

const index = (v: unknown, path: string, length: number) => {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= length) bad(path, `not an index below ${length}`);
  return v as number;
};

const list = (v: unknown, path: string, min = 0): readonly unknown[] => {
  if (!Array.isArray(v)) return bad(path, "not a list");
  if (v.length < min) bad(path, `fewer than ${min} entries`);
  return v;
};

const numbers = (v: unknown, path: string, n: number) => {
  const a = list(v, path);
  if (a.length !== n) bad(path, `not ${n} numbers`);
  return a.map((x, i) => num(x, at(path, i)));
};
const vec2 = (v: unknown, path: string) => numbers(v, path, 2) as unknown as Vec2;
const vec3 = (v: unknown, path: string) => numbers(v, path, 3) as unknown as Vec3;

const oneOf = <T extends string>(v: unknown, path: string, options: readonly T[]): T => {
  if (!options.includes(v as T)) bad(path, `not one of ${options.join(", ")}`);
  return v as T;
};

const positive = (v: unknown, path: string) => {
  const size = vec3(v, path);
  for (const [i, x] of size.entries()) if (x <= 0) bad(at(path, i), "not above 0");
  return size;
};

/** One parser per prop kind, so a new kind is one entry (and the compiler asks for it). */
const PROPS: { readonly [K in Prop["kind"]]: (v: unknown, path: string) => Extract<Prop, { kind: K }> } = {
  floor: (v, path) => {
    const o = object(v, path, ["kind", "y"]);
    return { kind: "floor", y: num(o.y, at(path, "y")) };
  },
  smith: (v, path) => {
    const o = object(v, path, ["kind", "x"]);
    return { kind: "smith", x: num(o.x, at(path, "x")) };
  },
  box: (v, path) => {
    const o = object(v, path, ["kind", "at", "size"], ["tilt"]);
    const box = { kind: "box", at: vec3(o.at, at(path, "at")), size: positive(o.size, at(path, "size")) } as const;
    return Object.hasOwn(o, "tilt") ? { ...box, tilt: num(o.tilt, at(path, "tilt"), [-90, 90]) } : box;
  },
};

const prop = (v: unknown, path: string): Prop => {
  const kind = typeof v === "object" && v !== null ? (v as Obj).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(PROPS, kind)) return bad(at(path, "kind"), `not one of ${Object.keys(PROPS).join(", ")}`);
  return PROPS[kind as Prop["kind"]](v, path);
};

const joints = (v: unknown, path: string): Joints => {
  const o = object(v, path, JOINTS);
  return Object.fromEntries(JOINTS.map((j) => [j, num(o[j], at(path, j), RANGES[j])])) as Record<JointName, number>;
};

/** Keyframe times start at exactly 0, rise strictly, and stay below 1 (t = 1 is keyframe 0 again). */
const keyframes = (v: unknown, path: string): readonly Keyframe[] =>
  list(v, path, 2).reduce<Keyframe[]>((out, raw, i) => {
    const p = at(path, i);
    const o = object(raw, p, ["t", "root", "joints", "bar"]);
    const t = num(o.t, at(p, "t"), [0, 1]);
    if (i === 0 && t !== 0) bad(at(p, "t"), "the first keyframe is not at 0");
    if (i > 0 && t <= out[i - 1]!.t) bad(at(p, "t"), "not after the previous keyframe");
    if (t >= 1) bad(at(p, "t"), "not below 1");
    out.push({ t, root: vec2(o.root, at(p, "root")), joints: joints(o.joints, at(p, "joints")), bar: vec2(o.bar, at(p, "bar")) });
    return out;
  }, []);

const LABEL_MAX = 24;

/** Steps run in keyframe order, so "2 of 3" means the second one in the loop. */
const steps = (v: unknown, path: string, count: number): Move["steps"] =>
  list(v, path, 1).reduce<Move["steps"][number][]>((out, raw, i) => {
    const p = at(path, i);
    const o = object(raw, p, ["keyframe", "label"]);
    const keyframe = index(o.keyframe, at(p, "keyframe"), count);
    if (i > 0 && keyframe <= out[i - 1]!.keyframe) bad(at(p, "keyframe"), "not after the previous step");
    const label = o.label;
    if (typeof label !== "string" || label.trim() === "" || label.length > LABEL_MAX) bad(at(p, "label"), `not 1 to ${LABEL_MAX} characters`);
    out.push({ keyframe, label: label as string });
    return out;
  }, []);

const CATALOG: readonly string[] = catalog.map((e) => e.id);

/** Parses the raw contents of `src/moves/<fileId>.json`. */
export const parseMove = (raw: unknown, fileId: string): Move => {
  const o = object(raw, "", ["id", "view", "camera", "implement", "durationMs", "keyPose", "grip", "props", "keyframes", "steps"], ["anchor"]);
  if (o.id !== fileId) bad("id", `not the file name, ${fileId}`);
  if (!CATALOG.includes(fileId)) bad("id", "not a catalog exercise");
  const camera = object(o.camera, "camera", ["yaw", "elevation"]);
  const grip = object(o.grip, "grip", ["halfWidth", "pole"]);
  const frames = keyframes(o.keyframes, "keyframes");
  const halfWidth = num(grip.halfWidth, "grip.halfWidth", [0, 60]);
  if (halfWidth === 0) bad("grip.halfWidth", "not above 0");
  const move: Move = {
    id: fileId,
    view: oneOf(o.view, "view", ["side"]),
    durationMs: num(o.durationMs, "durationMs", [1000, 10_000]),
    keyPose: index(o.keyPose, "keyPose", frames.length),
    grip: { halfWidth, pole: vec3(grip.pole, "grip.pole") },
    camera: { yaw: num(camera.yaw, "camera.yaw", [-90, 90]), elevation: num(camera.elevation, "camera.elevation", [-30, 60]) },
    implement: oneOf(o.implement, "implement", ["barbell", "handles"]),
    props: list(o.props, "props").map((p, i) => prop(p, at("props", i))),
    keyframes: frames,
    steps: steps(o.steps, "steps", frames.length),
  };
  return Object.hasOwn(o, "anchor") ? { ...move, anchor: oneOf(o.anchor, "anchor", ["heel"]) } : move;
};
