/**
 * The one figure every movement loop drives: proportions and forward kinematics.
 *
 * Model units are centimetres of a 178 cm lifter, 7.5 heads tall. x points the way the
 * lifter faces when standing, y points up, z points at the viewer (the near side).
 * The root is the pelvis (the hip joint centre). The torso is one rigid segment, so the
 * spine cannot flex and the shoulder point cannot ride up.
 */

export type Vec2 = readonly [x: number, y: number];
export type Vec3 = readonly [x: number, y: number, z: number];

export const JOINTS = ["trunk", "neck", "hip", "knee", "ankle"] as const;
export type JointName = (typeof JOINTS)[number];
export type Joints = Readonly<Record<JointName, number>>;

/**
 * A pose: the pelvis position in the side view, body joint angles in degrees, and where
 * the hands hold on. The hands are the equipment's: arms reach the grip by two-bone IK,
 * so a bar and the hands on it can never disagree.
 */
export type Pose = { readonly root: Vec2; readonly joints: Joints; readonly grip: Grip };

/** Both hands at `at` (side view), `halfWidth` out from the midline, elbows bending toward `pole`. */
export type Grip = { readonly at: Vec2; readonly halfWidth: number; readonly pole: Vec3 };

/** Anatomical range per joint, degrees. `trunk` is absolute, so it may point anywhere. */
export const RANGES: Readonly<Record<JointName, readonly [min: number, max: number]>> = {
  trunk: [-180, 180], // torso direction from vertical, + leans forward
  neck: [-30, 45], // flexion, + chin toward chest
  hip: [-30, 140], // flexion, + thigh forward
  knee: [0, 150], // flexion
  ankle: [-50, 40], // dorsiflexion, + shin over the toes
};

/** Range of the elbow angle the arm IK may produce (flexion, degrees). */
export const ELBOW_RANGE = [0, 150] as const;

const HEAD = 178 / 7.5;
/** Segment lengths and widths, cm. */
export const BODY = {
  head: HEAD,
  torso: 54, // hip joint to shoulder joint
  neck: 7, // shoulder line to the base of the skull
  upperArm: 31,
  forearm: 26,
  hand: 18, // wrist to fingertips; the grip sits near its middle
  thigh: 44,
  shin: 41,
  ankleHeight: 7,
  heel: 5, // ankle to the back of the heel, along the foot
  toe: 20, // ankle to the tip of the toes
  hipHalfWidth: 9,
  shoulderHalfWidth: 18,
} as const;

export type Limbs = {
  readonly hip: Vec3;
  readonly knee: Vec3;
  readonly ankle: Vec3;
  readonly heel: Vec3;
  readonly toe: Vec3;
  readonly shoulder: Vec3;
  readonly elbow: Vec3;
  readonly wrist: Vec3;
  readonly grip: Vec3;
};

export type Skeleton = {
  readonly pelvis: Vec3;
  readonly chest: Vec3; // centre of the shoulder line
  readonly neck: Vec3; // base of the skull
  readonly head: Vec3; // centre of the head
  /** Absolute side-view directions (degrees from vertical, + toward x) of each segment. */
  readonly angles: Readonly<Record<"trunk" | "head" | "thigh" | "shin" | "foot", number>>;
  /** Elbow flexion the arm IK produced, degrees. */
  readonly elbow: number;
  readonly near: Limbs;
  readonly far: Limbs;
};

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Unit vector in the side view for an absolute angle from vertical. */
const dir = (deg: number): Vec2 => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const at = (p: Vec2, z: number): Vec3 => [p[0], p[1], z];
const step = (from: Vec3, deg: number, length: number): Vec3 => {
  const [dx, dy] = dir(deg);
  return [from[0] + dx * length, from[1] + dy * length, from[2]];
};

/** Forward kinematics: pose → joint positions for both sides. */
export const skeleton = ({ root, joints: j, grip }: Pose): Skeleton => {
  const trunk = j.trunk;
  const head = trunk + j.neck;
  const thigh = trunk + 180 - j.hip;
  const shin = thigh + j.knee;
  const foot = shin - 90 - j.ankle;

  const pelvis = at(root, 0);
  const chest = step(pelvis, trunk, BODY.torso);
  const neck = step(chest, trunk, BODY.neck);
  const headCentre = step(neck, head, BODY.head / 2);

  const limbs = (side: 1 | -1): Limbs => {
    const hip: Vec3 = [pelvis[0], pelvis[1], side * BODY.hipHalfWidth];
    const knee = step(hip, thigh, BODY.thigh);
    const ankle = step(knee, shin, BODY.shin);
    const heel = step(ankle, foot + 180, BODY.heel);
    const toe = step(ankle, foot, BODY.toe);
    const shoulder: Vec3 = [chest[0], chest[1], side * BODY.shoulderHalfWidth];
    const target: Vec3 = [grip.at[0], grip.at[1], side * grip.halfWidth];
    const { elbow, wrist } = reach(shoulder, target, [grip.pole[0], grip.pole[1], side * grip.pole[2]]);
    return { hip, knee, ankle, heel, toe, shoulder, elbow, wrist, grip: target };
  };

  const near = limbs(1);
  return {
    pelvis,
    chest,
    neck,
    head: headCentre,
    angles: { trunk, head, thigh, shin, foot },
    elbow: elbowFlexion(near),
    near,
    far: limbs(-1),
  };
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => add([0, 0, 0], a, 1 / (len(a) || 1));

/** Upper arm, and forearm to the grip point in the palm. */
const ARM = [BODY.upperArm, BODY.forearm + BODY.hand * 0.45] as const;

/** Two-bone IK: the elbow sits where both segments meet, on the side of `pole`. A target out of reach is approached in a straight arm. */
const reach = (shoulder: Vec3, target: Vec3, pole: Vec3) => {
  const [l1, l2] = ARM;
  const span = sub(target, shoulder);
  const d = Math.min(Math.max(len(span), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const u = unit(span);
  const v = unit(add(pole, u, -dot(pole, u)));
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const elbow = add(add(shoulder, u, along), v, Math.sqrt(Math.max(l1 * l1 - along * along, 0)));
  const hand = add(shoulder, u, d);
  const wrist = add(elbow, unit(sub(hand, elbow)), BODY.forearm);
  return { elbow, wrist };
};

const elbowFlexion = ({ shoulder, elbow, wrist }: Limbs) => {
  const a = unit(sub(elbow, shoulder));
  const b = unit(sub(wrist, elbow));
  return (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI;
};

/** Standing tall, arms by the sides: every joint at zero. Feet flat, ankles at the origin's height. */
export const STANDING: Pose = {
  root: [0, BODY.ankleHeight + BODY.shin + BODY.thigh],
  joints: { trunk: 0, neck: 0, hip: 0, knee: 0, ankle: 0 },
  // Arms hanging, hands by the thighs.
  grip: { at: [0, BODY.ankleHeight + BODY.shin + BODY.thigh + BODY.torso - BODY.upperArm - BODY.forearm - BODY.hand * 0.45 + 2], halfWidth: 20, pole: [-1, 0, 0] },
};
