// Shared by the bench and row loop tests: sampling, the torso frame, and box props.
import { poseAt, type Move, type Prop } from "../../src/moves/sample.ts";
import { BODY, skeleton, type Skeleton, type Vec2, type Vec3 } from "../../src/moves/skeleton.ts";

export const N = 360;

export const sampleLoop = (move: Move) =>
  Array.from({ length: N }, (_, i) => {
    const pose = poseAt(move, i / N);
    return { t: i / N, pose, body: skeleton(pose) };
  });
export type Frame = ReturnType<typeof sampleLoop>[number];

/**
 * Surface points of the mesh in the torso's frame (`along` the spine from the pelvis, `front`
 * of its axis), read off figure.ts: the deepest point of the glutes, the most forward point of
 * the chest, the back at the shoulder blades.
 */
export const GLUTES = { along: 4, front: -11.19 };
export const CHEST = { along: 40, front: 14.44 };
export const BACK = -9.68;
export const BLADES = { along: 55.5, front: BACK };
/** The back of the skull in the head's frame: `along` the head axis from the base of the skull, `front` of it. */
export const SKULL = { along: 11.96, front: -6.53 };

const torsoAxes = (body: Skeleton) => {
  const t = Math.atan2(body.chest[0] - body.pelvis[0], body.chest[1] - body.pelvis[1]);
  return [Math.sin(t), Math.cos(t), Math.cos(t), -Math.sin(t)] as const;
};
/** World point (z = 0) of a point given in the torso's frame. */
export const onTorso = (body: Skeleton, { along, front }: { along: number; front: number }): Vec3 => {
  const [ax, ay, fx, fy] = torsoAxes(body);
  return [body.pelvis[0] + along * ax + front * fx, body.pelvis[1] + along * ay + front * fy, 0];
};
/** World point (z = 0) of a point given in the head's frame. */
export const onHead = (body: Skeleton, { along, front }: { along: number; front: number }): Vec3 => {
  const t = Math.atan2(body.head[0] - body.neck[0], body.head[1] - body.neck[1]);
  const [ax, ay, fx, fy] = [Math.sin(t), Math.cos(t), Math.cos(t), -Math.sin(t)];
  return [body.neck[0] + along * ax + front * fx, body.neck[1] + along * ay + front * fy, 0];
};
/** A world point in the torso's frame. */
export const inTorso = (body: Skeleton, p: Vec2 | Vec3) => {
  const [ax, ay, fx, fy] = torsoAxes(body);
  const dx = p[0] - body.pelvis[0], dy = p[1] - body.pelvis[1];
  return { along: dx * ax + dy * ay, front: dx * fx + dy * fy };
};

export type Box = Extract<Prop, { kind: "box" }>;
export const boxes = (move: Move): Box[] => move.props.flatMap((p) => (p.kind === "box" ? [p] : []));

/** Signed distance from `p` to a box prop, cm: negative inside. */
export const sdBox = (p: Vec3, b: Box) => {
  const tilt = ((b.tilt ?? 0) * Math.PI) / 180;
  const [dx, dy, dz] = [p[0] - b.at[0], p[1] - b.at[1], p[2] - b.at[2]];
  const local = [dx * Math.cos(tilt) + dy * Math.sin(tilt), -dx * Math.sin(tilt) + dy * Math.cos(tilt), dz];
  const q = local.map((v, i) => Math.abs(v) - b.size[i]! / 2);
  return Math.hypot(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
};
/** The box whose surface is nearest `p`. */
export const nearestBox = (move: Move, p: Vec3) =>
  boxes(move).reduce((a, b) => (Math.abs(sdBox(p, b)) < Math.abs(sdBox(p, a)) ? b : a));

export const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, (a[2] ?? 0) - (b[2] ?? 0));

/** Where the fist closes: along the forearm, 0.45 of a hand past the wrist. The hand holds on when this is the grip. */
export const fist = ({ elbow, wrist }: Skeleton["near"]): Vec3 => {
  const l = dist(wrist, elbow);
  const k = (BODY.hand * 0.45) / l;
  return [wrist[0] + (wrist[0] - elbow[0]) * k, wrist[1] + (wrist[1] - elbow[1]) * k, wrist[2] + (wrist[2] - elbow[2]) * k];
};
export const handsOff = (body: Skeleton) => Math.max(dist(fist(body.near), body.near.grip), dist(fist(body.far), body.far.grip));

/** Side-view angle of a segment from vertical, degrees. */
export const fromVertical = (a: readonly number[], b: readonly number[]) =>
  (Math.atan2(Math.abs(b[0]! - a[0]!), Math.abs(b[1]! - a[1]!)) * 180) / Math.PI;

/** The frame where `score` is largest. */
export const most = (loop: Frame[], score: (f: Frame) => number) => loop.reduce((a, b) => (score(b) > score(a) ? b : a));
