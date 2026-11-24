/**
 * The low-poly lifter and the Smith machine as data.
 *
 * Every solid is a loft: rings of an n-gon swept along one segment's axis. A ring is
 * [t, f, s, hf, hs] in the segment's frame, centimetres: t along the axis from the frame
 * origin, (f, s) the ring centre's offset, (hf, hs) its half extents. A zero-size ring is
 * an apex; otherwise the end rings are closed by a flat cap.
 *
 * Frames (see `frames` in render.ts): a = the segment axis, s = lateral (out from the
 * midline, mirrored on the far side), f = a x s. On the torso and head f points to the
 * front; on the thigh and shin it points to the back; on the foot it points down at the
 * sole. Arms are round, so their roll does not matter.
 */

export const SEG = ["torso", "head", "bar", "rail", "thigh", "shin", "foot", "upper", "fore", "hand"] as const;
export type Seg = (typeof SEG)[number];

/** Tone classes; far-side limbs take the dimmer body tone. */
export const enum Tone { Body, Far, Bar, Rail }

type Ring = readonly [t: number, f: number, s: number, hf: number, hs: number];
type Part = { seg: Seg; n: number; rings: readonly Ring[]; tone?: Tone; bias?: number; frame?: false };

const BODY_PARTS: readonly Part[] = [
  // Pelvis block: glutes push back, a narrow crotch, the waist on top.
  { seg: "torso", n: 8, rings: [[-10.5, 1, 0, 4, 6], [-5, -1.4, 0, 10, 14.8], [4, -2.2, 0, 11.6, 16.4], [13, -0.4, 0, 10.2, 15.4], [20, 0.8, 0, 8.6, 13.2]] },
  // Ribcage and chest: deepest at the pecs, widest under the arms, a trapezius slope to the neck.
  { seg: "torso", n: 8, rings: [[18, 1.2, 0, 9.2, 13], [29, 2.2, 0, 11.2, 14.8], [40, 2, 0, 12.4, 16.4], [49, 1, 0, 11.8, 17.6], [55.5, -0.6, 0, 8.8, 14.6], [59.5, -1.4, 0, 5.4, 6.6]] },
  // Neck, from inside the chest up into the skull.
  { seg: "head", n: 6, rings: [[-9, 0.2, 0, 6, 6.2], [-1, 0.6, 0, 5.4, 5.6], [4, 1.2, 0, 5, 5.2]] },
  // Head: an egg with a jaw plane under a forward chin, the skull bulging behind the neck.
  { seg: "head", n: 8, rings: [[1.2, 6.2, 0, 2.2, 3.2], [2.6, 3.6, 0, 6.4, 5.2], [7.5, 2.4, 0, 8.2, 6.8], [13, 1.4, 0, 9.2, 7.5], [18, 0.6, 0, 7.8, 6.6], [21.6, -0.3, 0, 4.4, 4.1], [22.8, -0.6, 0, 1.6, 1.5]] },
];

/** One side's limbs; each is placed twice, near and far. */
const LIMB_PARTS: readonly Part[] = [
  // Thigh (f = back): full at the top, quads forward, narrowing into the knee.
  { seg: "thigh", n: 8, rings: [[-6, 0, 0, 6.5, 6.5], [2, 0, 0.4, 9, 8.8], [14, -0.4, 0.3, 8.4, 7.9], [30, -0.9, 0, 6.8, 6.3], [40, -0.3, 0, 5.3, 5.3], [45, 0, 0, 4.8, 5]] },
  // Kneecap: a small facet on the front of the knee.
  { seg: "thigh", n: 5, rings: [[40.5, -3.6, 0, 0, 0], [43.5, -3.9, 0, 2.6, 3], [46.5, -3.2, 0, 0, 0]], bias: 1 },
  // Shin (f = back): the calf bulges behind a straight shinbone, ankle bones at the end.
  { seg: "shin", n: 6, rings: [[-1.5, 0, 0, 4.6, 4.8], [3, 0.6, 0, 5.3, 5], [11, 2.6, 0, 6.2, 5.2], [24, 1.4, 0, 4.4, 3.9], [37, 0.3, 0, 3, 3], [41, 0.2, 0, 3.2, 3.5]] },
  // Shoe wedge (f = down): flat sole 7 cm under the ankle, heel counter, instep, toe box.
  { seg: "foot", n: 6, rings: [[-6.8, 3.6, 0, 3.6, 2.6], [-6, 3, 0, 4.6, 3.3], [0, 2.5, 0, 5.2, 4.2], [8, 3.8, 0, 3.7, 4.8], [15, 5, 0, 2.3, 5], [20.5, 5.4, 0, 1.85, 4.2], [22, 5.8, 0, 1.2, 3]] },
  // Upper arm with the deltoid cap over the shoulder joint.
  { seg: "upper", n: 6, rings: [[-5.5, 0, 0, 3.6, 3.6], [-1.5, 0, 0, 6.6, 6.6], [6, 0, 0, 5.6, 5.6], [16, 0, 0, 5, 4.8], [27, 0, 0, 4, 4], [31, 0, 0, 3.5, 3.7]] },
  // Forearm: bevelled at the elbow, full near it, flat at the wrist.
  { seg: "fore", n: 6, rings: [[-2.5, 0, 0, 2.6, 2.6], [0, 0, 0, 4, 4], [7, 0, 0, 4.6, 4.3], [20, 0, 0, 3.2, 3], [26, 0, 0, 2.7, 2.5]] },
  // Mitt: a closed fist around the bar, wide along it.
  { seg: "hand", n: 6, rings: [[-0.5, 0, 0, 2.4, 3], [3, 0, 0, 3.2, 4.4], [9, 0.3, 0, 3.6, 4.6], [11.5, 0, 0, 2.2, 3.4]], bias: 6 },
];

const sleeve = 2.6;
const shaft = 1.5;
/** Smith machine: rails at z = ±RAIL_Z, the bar between and past them, carriages on the rails. */
export const RAIL_Z = 60;
const EQUIPMENT: readonly Part[] = [
  // Bar along z in pieces, so depth sorting holds where it passes behind the neck and through the fists.
  ...[[-74, -63, sleeve], [-63, -30, shaft], [-30, -10, shaft], [-10, 10, shaft], [10, 30, shaft], [30, 63, shaft], [63, 74, sleeve]].map(
    ([a, b, r]): Part => ({ seg: "bar", n: 6, tone: Tone.Bar, rings: [[a!, 0, 0, r!, r!], [b!, 0, 0, r!, r!]] }),
  ),
  // Carriages riding the rails at bar height; a 4-gon ring is the box inscribed in the ellipse.
  ...[RAIL_Z, -RAIL_Z].map((z): Part => ({ seg: "bar", n: 4, tone: Tone.Bar, rings: [[z - 3, 0, 0, 3.5, 7], [z + 3, 0, 0, 3.5, 7]] })),
  // Rails: run off the top of the frame, so they do not count toward its bounds. Drawn behind the
  // lifter: the near rail would otherwise slice through the hips at the bottom of the squat.
  ...[RAIL_Z, -RAIL_Z].map((z): Part => ({ seg: "rail", n: 6, tone: Tone.Rail, frame: false, bias: -500, rings: [[0, 0, z, 1.4, 1.4], [400, 0, z, 1.4, 1.4]] })),
];

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
};

/** Frame slots: torso, head, bar, rail, then thigh..hand for the near side, then for the far side. */
export const FRAME_COUNT = 4 + 6 * 2;
const frameIndex = (seg: Seg, far: boolean) => {
  const i = SEG.indexOf(seg);
  return i < 4 ? i : i + (far ? 6 : 0);
};

export const buildMesh = (): Mesh => {
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
  for (const p of EQUIPMENT) add(p, false);

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
  };
};
