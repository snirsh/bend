/**
 * The low-poly lifter and its equipment as data.
 *
 * Every solid is a loft: rings of an n-gon swept along one segment's axis. A ring is
 * [t, f, s, hf, hs] in the segment's frame, centimetres: t along the axis from the frame
 * origin, (f, s) the ring centre's offset, (hf, hs) its half extents. A zero-size ring is
 * an apex; otherwise the end rings are closed by a flat cap.
 *
 * Frames (see `frames` in render.ts): a = the segment axis, s = lateral (out from the
 * midline, mirrored on the far side), f = a x s. On the torso and head f points to the
 * front; on the thigh and shin it points to the back; on the foot it points down at the
 * sole. Arms are round, so their roll does not matter. A box prop is a loft along its own
 * x axis in a frame of its own, after the fixed slots.
 */
import type { Move } from "./sample.ts";
import type { Vec3 } from "./skeleton.ts";

export const SEG = ["torso", "head", "bar", "rail", "thigh", "shin", "foot", "upper", "fore", "hand"] as const;
export type Seg = (typeof SEG)[number];

/** Tone classes; far-side limbs take the dimmer body tone. */
export const enum Tone { Body, Far, Bar, Rail }

type Ring = readonly [t: number, f: number, s: number, hf: number, hs: number];
/** `seg` names a fixed frame slot, or is a box's own slot number. `frame: false` keeps a part out of the framing bounds. */
type Part = { seg: Seg | number; n: number; rings: readonly Ring[]; tone?: Tone; bias?: number; frame?: false };

const BODY_PARTS: readonly Part[] = [
  // Pelvis block: glutes push back, a narrow crotch, the waist on top.
  { seg: "torso", n: 8, rings: [[-10.5, 1, 0, 4, 6], [-5, -0.8, 0, 9.2, 14.4], [4, -1.4, 0, 10.6, 15.8], [13, -0.2, 0, 9.8, 15], [20, 0.8, 0, 8.6, 13.2]] },
  // Ribcage and chest: deepest at the pecs, widest under the arms, a trapezius slope to the neck.
  { seg: "torso", n: 8, rings: [[18, 1, 0, 9.2, 13], [29, 2.4, 0, 11.2, 15], [40, 2.8, 0, 12.6, 17.6], [49, 1.6, 0, 12, 19.6], [55.5, -1, 0, 9.4, 16.8], [59.5, -2, 0, 6.2, 8]] },
  // Neck, from inside the chest up into the skull.
  { seg: "head", n: 6, rings: [[-9, 0.2, 0, 6, 6.2], [-1, 0.6, 0, 5.4, 5.6], [4, 1.2, 0, 5, 5.2]] },
  // Head: an egg with a jaw plane under a forward chin, the skull bulging behind the neck. 92% scale against the broad shoulders.
  { seg: "head", n: 8, rings: [[1.1,  5.7,  0.0,  2.02,  2.94],  [2.39,  3.31,  0.0,  5.89,  4.78],  [6.9,  2.21,  0.0,  7.54,  6.26],  [11.96,  1.29,  0.0,  8.46,  6.9],  [16.56,  0.55,  0.0,  7.18,  6.07],  [19.87,  -0.28,  0.0,  4.05,  3.77],  [20.98,  -0.55,  0.0,  1.47,  1.38]] },
  // Nose: one small wedge, so the facing direction reads even from behind.
  { seg: "head", n: 4, rings: [[9.6, 8.7, 0, 1.1, 1.1], [12.4, 10.4, 0, 0, 0]] },
];

/** One side's limbs; each is placed twice, near and far. */
const LIMB_PARTS: readonly Part[] = [
  // Thigh (f = back): full at the top, quads forward, narrowing into the knee.
  { seg: "thigh", n: 8, rings: [[-6, 0, 0, 6.5, 6.5], [2, 0, 0.4, 9, 8.8], [14, -0.4, 0.3, 8.4, 7.9], [30, -0.9, 0, 6.8, 6.3], [40, -0.3, 0, 5.3, 5.3], [45, 0, 0, 4.8, 5]] },
  // Kneecap: a small facet on the front of the knee.
  { seg: "thigh", n: 6, rings: [[40.5, -2.6, 0, 0, 0], [43.5, -3.2, 0, 2.2, 3], [46.5, -2.4, 0, 0, 0]], bias: 1 },
  // Shin (f = back): the calf bulges behind a straight shinbone, ankle bones at the end.
  { seg: "shin", n: 6, rings: [[-1.5, 0, 0, 4.6, 4.8], [3, 0.6, 0, 5.3, 5], [11, 2.6, 0, 6.2, 5.2], [24, 1.4, 0, 4.4, 3.9], [37, 0.3, 0, 3, 3], [41, 0.2, 0, 3.2, 3.5]] },
  // Foot (f = down): a rounded heel, the arch lifting off the floor under the instep, the ball, a toe box that tapers to the tip.
  { seg: "foot", n: 6, rings: [[-6.8, 3.8, 0, 2.6, 2.2], [-5.4, 3, 0, 4, 3.2], [-1, 2.4, 0, 4.6, 3.8], [5, 2.6, 0, 3.6, 4], [11, 3.9, 0, 3.1, 4.8], [15.5, 4.8, 0, 2.2, 5], [19.5, 5.4, 0, 1.6, 4.4], [22, 5.6, 0, 0.9, 2.8]] },
  // Heel pad and ball of the foot: the two flat facets the foot stands on, so the arch reads between them.
  { seg: "foot", n: 4, rings: [[-6.4, 6.4, 0, 0.6, 2.2], [-1.6, 6.4, 0, 0.6, 2.6]] },
  { seg: "foot", n: 4, rings: [[11.5, 6.4, 0, 0.6, 4], [18.5, 6.4, 0, 0.6, 3.8]] },
  // Upper arm with the deltoid cap over the shoulder joint.
  { seg: "upper", n: 6, rings: [[-5.5, 0, 0, 3.6, 3.6], [-1.5, 0, 0, 6.6, 6.6], [6, 0, 0, 5.6, 5.6], [16, 0, 0, 5, 4.8], [27, 0, 0, 4, 4], [31, 0, 0, 3.5, 3.7]] },
  // Forearm: bevelled at the elbow, full near it, flat at the wrist.
  { seg: "fore", n: 6, rings: [[-2.5, 0, 0, 2.6, 2.6], [0, 0, 0, 4, 4], [7, 0, 0, 4.6, 4.3], [20, 0, 0, 3.2, 3], [26, 0, 0, 2.7, 2.5]] },
  // Mitt: a closed fist around the bar, wide along it.
  { seg: "hand", n: 6, rings: [[-0.5, 0, 0, 2.4, 3], [3, 0, 0, 3.2, 4.4], [9, 0.3, 0, 3.6, 4.6], [11.5, 0, 0, 2.2, 3.4]], bias: 6 },
  // Thumb: a wedge from the heel of the hand wrapping the bar from the other side of the fingers.
  { seg: "hand", n: 5, rings: [[1, -2.4, -2.6, 1.6, 1.4], [5.5, -3.6, -3.2, 1.2, 1.1], [8.5, -3, -2.6, 0, 0]], bias: 6 },
];

const sleeve = 2.6;
const shaft = 1.5;
/** Smith machine: rails at z = ±RAIL_Z, the bar between and past them, carriages on the rails. */
export const RAIL_Z = 60;
/** The bar along z in pieces, so depth sorting holds where it passes behind the neck and through the fists. */
const BAR: readonly Part[] = [[-74, -63, sleeve], [-63, -30, shaft], [-30, -10, shaft], [-10, 10, shaft], [10, 30, shaft], [30, 63, shaft], [63, 74, sleeve]].map(
  ([a, b, r]): Part => ({ seg: "bar", n: 6, tone: Tone.Bar, rings: [[a!, 0, 0, r!, r!], [b!, 0, 0, r!, r!]] }),
);
const SMITH: readonly Part[] = [
  // Carriages riding the rails at bar height; a 4-gon ring is the box inscribed in the ellipse.
  ...[RAIL_Z, -RAIL_Z].map((z): Part => ({ seg: "bar", n: 4, tone: Tone.Bar, rings: [[z - 3, 0, 0, 3.5, 7], [z + 3, 0, 0, 3.5, 7]] })),
  // Rails: run off the top of the frame, so they do not count toward its bounds. Drawn behind the
  // lifter: the near rail would otherwise slice through the hips at the bottom of the squat.
  ...[RAIL_Z, -RAIL_Z].map((z): Part => ({ seg: "rail", n: 6, tone: Tone.Rail, frame: false, bias: -500, rings: [[0, 0, z, 0.8, 0.8], [400, 0, z, 0.8, 0.8]] })),
];
/** Radius of a 20 kg plate, cm. */
const PLATE = 22.5;
/** A free bar: one plate and a collar on each sleeve. */
const PLATES: readonly Part[] = [1, -1].flatMap((side): Part[] => [
  { seg: "bar", n: 10, tone: Tone.Bar, rings: [[side * 64, 0, 0, PLATE, PLATE], [side * 67.5, 0, 0, PLATE, PLATE]] },
  { seg: "bar", n: 6, tone: Tone.Bar, rings: [[side * 67.5, 0, 0, 3.4, 3.4], [side * 69.5, 0, 0, 3.4, 3.4]] },
]);
/** Two handles, one through each fist, each ending outside the hand in the block of the lever that carries it. */
const handles = (halfWidth: number): Part[] =>
  [1, -1].flatMap((side): Part[] => [
    { seg: "bar", n: 6, tone: Tone.Bar, rings: [[side * (halfWidth - 5.5), 0, 0, 1.7, 1.7], [side * (halfWidth + 7), 0, 0, 1.7, 1.7]] },
    { seg: "bar", n: 4, tone: Tone.Bar, rings: [[side * (halfWidth + 7), 0, 0, 4, 4], [side * (halfWidth + 11), 0, 0, 4, 4]] },
  ]);
/**
 * A box as a 4-sided loft along its x axis: a 4-gon ring is the box inscribed in the
 * ellipse, so the half extents grow by √2. Cut about every 20 cm, so a long pad sorts
 * against the body lying on it face by face, not as one far-away centroid.
 */
const box = ([l, h, w]: Vec3, slot: number): Part => {
  const cuts = Math.max(1, Math.round(l / 20));
  const ring = (i: number): Ring => [-l / 2 + (l * i) / cuts, 0, 0, (h / 2) * Math.SQRT2, (w / 2) * Math.SQRT2];
  return { seg: slot, n: 4, tone: Tone.Rail, frame: false, rings: Array.from({ length: cuts + 1 }, (_, i) => ring(i)) };
};
/** Equipment parts for a move, in draw-index order: the implement, the Smith machine, then each box. */
const equipment = ({ implement, props, grip }: Equipment): Part[] => {
  const smith = props.some((p) => p.kind === "smith");
  const held = implement === "handles" ? handles(grip.halfWidth) : [...BAR, ...(smith ? SMITH : PLATES)];
  const boxes = props.flatMap((p) => (p.kind === "box" ? [p] : [])).map((p, k) => box(p.size, FRAME_COUNT + k));
  return [...held, ...boxes];
};

/** Built mesh, flat arrays. Vertex v belongs to frame vf[v]; face i spans fv[fo[i]..fo[i+1]). */
export type Mesh = {
  lv: Float32Array; // local t, f, s per vertex
  vf: Uint8Array; // frame index per vertex
  fv: Uint16Array; // vertex indices of every face, concatenated
  fo: Uint16Array; // face offsets into fv, length faces + 1
  fn: Float32Array; // outward local normal per face (t, f, s)
  ff: Uint8Array; // frame index per face
  ft: Uint8Array; // tone per face
  fb: Float32Array; // depth bias per face, cm
  vb: Uint8Array; // 1 body, 2 bar: counts toward the framing bounds; 0 never
  frames: number; // frame slots: the fixed ones, then one per box prop
};

/** What a move holds and stands on: enough to build its equipment. */
export type Equipment = Pick<Move, "implement" | "props" | "grip">;

/** Frame slots: torso, head, bar, rail, then thigh..hand for the near side, then for the far side. Box props follow. */
export const FRAME_COUNT = 4 + 6 * 2;
const frameIndex = (seg: Seg | number, far: boolean) => {
  if (typeof seg === "number") return seg;
  const i = SEG.indexOf(seg);
  return i < 4 ? i : i + (far ? 6 : 0);
};

export const buildMesh = (move: Equipment): Mesh => {
  const lv: number[] = [], vf: number[] = [], vb: number[] = [];
  const fv: number[] = [], fo: number[] = [0], fn: number[] = [], ff: number[] = [], ft: number[] = [], fb: number[] = [];

  const add = (p: Part, far: boolean) => {
    const frame = frameIndex(p.seg, far);
    const base = vf.length;
    const rings: number[][] = [];
    for (const [t, f, s, hf, hs] of p.rings) {
      const ring: number[] = [];
      const count = hf === 0 && hs === 0 ? 1 : p.n;
      for (let k = 0; k < count; k++) {
        const th = ((k + 0.5) / p.n) * Math.PI * 2;
        ring.push(vf.length);
        lv.push(t, f + hf * Math.cos(th), s + hs * Math.sin(th));
        vf.push(frame);
        vb.push(p.frame === false ? 0 : p.tone === Tone.Bar ? 2 : 1);
      }
      rings.push(ring);
    }
    // Part centroid, to orient each face's normal outward.
    let ct = 0, cf = 0, cs = 0;
    const nv = vf.length - base;
    for (let v = base; v < vf.length; v++) (ct += lv[v * 3]!), (cf += lv[v * 3 + 1]!), (cs += lv[v * 3 + 2]!);
    const centre = [ct / nv, cf / nv, cs / nv];

    const face = (idx: number[]) => {
      // Newell normal, flipped to point away from the centroid.
      let nx = 0, ny = 0, nz = 0, mx = 0, my = 0, mz = 0;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[i]! * 3, b = idx[(i + 1) % idx.length]! * 3;
        nx += (lv[a + 1]! - lv[b + 1]!) * (lv[a + 2]! + lv[b + 2]!);
        ny += (lv[a + 2]! - lv[b + 2]!) * (lv[a]! + lv[b]!);
        nz += (lv[a]! - lv[b]!) * (lv[a + 1]! + lv[b + 1]!);
        mx += lv[a]!, my += lv[a + 1]!, mz += lv[a + 2]!;
      }
      const m = idx.length;
      const out = (mx / m - centre[0]!) * nx + (my / m - centre[1]!) * ny + (mz / m - centre[2]!) * nz;
      const l = Math.hypot(nx, ny, nz) * (out < 0 ? -1 : 1) || 1;
      fv.push(...idx);
      fo.push(fv.length);
      fn.push(nx / l, ny / l, nz / l);
      ff.push(frame);
      ft.push(p.tone ?? (far ? Tone.Far : Tone.Body));
      fb.push(p.bias ?? 0);
    };

    for (let r = 0; r + 1 < rings.length; r++) {
      const a = rings[r]!, b = rings[r + 1]!;
      for (let k = 0; k < p.n; k++) {
        const k1 = (k + 1) % p.n;
        if (a.length === 1) face([a[0]!, b[k]!, b[k1]!]);
        else if (b.length === 1) face([a[k]!, a[k1]!, b[0]!]);
        else face([a[k]!, a[k1]!, b[k1]!, b[k]!]);
      }
    }
    const first = rings[0]!, last = rings[rings.length - 1]!;
    if (first.length > 1) face([...first]);
    if (last.length > 1) face([...last].reverse());
  };

  for (const p of BODY_PARTS) add(p, false);
  for (const far of [false, true]) for (const p of LIMB_PARTS) add(p, far);
  for (const p of equipment(move)) add(p, false);

  return {
    lv: new Float32Array(lv),
    vf: new Uint8Array(vf),
    fv: new Uint16Array(fv),
    fo: new Uint16Array(fo),
    fn: new Float32Array(fn),
    ff: new Uint8Array(ff),
    ft: new Uint8Array(ft),
    fb: new Float32Array(fb),
    vb: new Uint8Array(vb),
    frames: FRAME_COUNT + move.props.filter((p) => p.kind === "box").length,
  };
};
