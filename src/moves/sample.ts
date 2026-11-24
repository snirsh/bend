import { JOINTS, skeleton, type Grip, type JointName, type Joints, type Pose, type Vec2, type Vec3 } from "./skeleton.ts";

/**
 * Periodic monotone cubic interpolation (PCHIP, Fritsch–Butland weights) of one channel.
 *
 * `ts` are keyframe times, strictly increasing in [0, 1); `vs` their values. The curve
 * passes through every keyframe, is smooth (C1) across keyframes and across the loop seam,
 * and never leaves the range of the two keyframes around it, so there is no bounce. The
 * slope is zero at every turnaround and inside every hold, which is the ease in and out.
 */
export const periodic = (ts: readonly number[], vs: readonly number[], t: number): number => {
  const n = ts.length;
  if (n === 1) return vs[0]!;
  const u = t - Math.floor(t);
  const time = (i: number) => ts[((i % n) + n) % n]! + Math.floor(i / n);
  const value = (i: number) => vs[((i % n) + n) % n]!;
  const slope = (i: number) => (value(i + 1) - value(i)) / (time(i + 1) - time(i));
  const tangent = (i: number) => {
    const before = slope(i - 1);
    const after = slope(i);
    if (before * after <= 0) return 0;
    const h0 = time(i) - time(i - 1);
    const h1 = time(i + 1) - time(i);
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / before + w1 / after);
  };

  let k = n - 1;
  while (k > 0 && ts[k]! > u) k--;
  const h = time(k + 1) - time(k);
  const s = (u - time(k)) / h;
  if (s === 0) return value(k);
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * value(k) +
    (s3 - 2 * s2 + s) * h * tangent(k) +
    (-2 * s3 + 3 * s2) * value(k + 1) +
    (s3 - s2) * h * tangent(k + 1)
  );
};

/** One keyframe of a move file: the pelvis, body joint angles, and where the bar or handles are. */
export type Keyframe = { readonly t: number; readonly root: Vec2; readonly joints: Joints; readonly bar: Vec2 };

/** Static equipment. A box is centred at `at` (cm), `size` its full extents, `tilt` degrees about z (+ raises its +x end). */
export type Prop =
  | { readonly kind: "floor"; readonly y: number }
  | { readonly kind: "smith"; readonly x: number }
  | { readonly kind: "box"; readonly at: Vec3; readonly size: Vec3; readonly tilt?: number };

/** A move file, `src/moves/<id>.json`. */
export type Move = {
  readonly id: string;
  readonly view: "side";
  readonly durationMs: number;
  /** Keyframe shown when nothing plays. */
  readonly keyPose: number;
  readonly grip: Omit<Grip, "at">;
  /** A planted foot: it keeps the place and the angle keyframe 0 gives it, whatever the leg does. */
  readonly anchor?: "heel";
  /** Orthographic camera: yaw turns from the pure side view toward the lifter's front (negative: from behind), elevation raises it. Degrees. */
  readonly camera: { readonly yaw: number; readonly elevation: number };
  /** What the hands hold at the keyframes' `bar` point: a barbell along z, or two handles. */
  readonly implement: "barbell" | "handles";
  readonly props: readonly Prop[];
  readonly keyframes: readonly Keyframe[];
  readonly steps: readonly { readonly keyframe: number; readonly label: string }[];
};

/** The pose at loop time `t` (any real number; 1 is 0 again). */
export const poseAt = (move: Move, t: number): Pose => {
  const { keyframes } = move;
  const ts = keyframes.map((k) => k.t);
  const channel = (pick: (k: Keyframe) => number) => periodic(ts, keyframes.map(pick), t);
  const joints = Object.fromEntries(JOINTS.map((j) => [j, channel((k) => k.joints[j])])) as Record<JointName, number>;
  const pose: Pose = {
    root: [channel((k) => k.root[0]), channel((k) => k.root[1])],
    joints,
    grip: { ...move.grip, at: [channel((k) => k.bar[0]), channel((k) => k.bar[1])] },
  };
  if (!move.anchor) return pose;
  // Channels interpolate independently, so a planted foot would slide and tilt a hair
  // between keyframes. The ankle takes up the tilt and a shift of the root the slide.
  const first = keyframes[0]!;
  const planted = skeleton({ ...pose, root: first.root, joints: first.joints });
  const free = skeleton(pose);
  const ankle = joints.ankle + free.angles.foot - planted.angles.foot;
  const flat = skeleton({ ...pose, joints: { ...joints, ankle } });
  const [want, got] = [planted.near.heel, flat.near.heel];
  return { ...pose, joints: { ...joints, ankle }, root: [pose.root[0] + want[0] - got[0], pose.root[1] + want[1] - got[1]] };
};
