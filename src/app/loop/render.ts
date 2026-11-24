/**
 * Canvas 2D projector for the low-poly lifter: fixed orthographic camera, back-face
 * culling, painter's sort by face depth, one Lambert term per face, theme colours read
 * from the CSS custom properties. No dependencies beyond the shared skeleton.
 */
import { skeleton, type Vec2, type Vec3 } from "../../moves/skeleton.ts";
import { poseAt, type Move } from "../../moves/sample.ts";
import { buildMesh, FRAME_COUNT, RAIL_Z, Tone } from "../../moves/figure.ts";

/** Camera and light. Yaw turns the camera from the pure side view toward the lifter's front. */
export const VIEW = {
  yaw: -25,
  elevation: 8,
  /** Toward the light in camera space: x right, y up, z toward the viewer. */
  light: [-0.6, 0.7, 0.4] as Vec3,
  ambient: 0.15,
  /** A rim from behind the lifter, opposite the key light: separates the silhouette from the ground. Camera space. */
  rim: [0.75, 0.2, -0.65] as Vec3,
  rimStrength: 0.35,
  /** Lambert exponent: above 1 darkens the half-lit facets, so neighbouring facets separate. */
  gamma: 1.5,
  /** How far the --muted end of the body ramp mixes on toward the background. */
  spread: 0.35,
  /** The same on a light ground, where the body is the dark end: a wider ramp keeps its form. */
  spreadLight: 0.6,
  /** How far far-side limbs and the floor mix toward the background. */
  far: 0.3,
  pad: 0.03,
  /** "body" frames the lifter alone and lets the rails, bar ends and floor crop at the edge. */
  fit: "body" as "all" | "body",
  /** Frame one loop time instead of the whole loop: for a still that should fill the frame. */
  fitAt: null as number | null,
  /** Shade steps per tone ramp. */
  levels: 32,
};

/** Floor plane footprint, cm: under the lifter and out to the rails. */
const FLOOR = { x0: -50, x1: 42, z: RAIL_Z + 6 };

type Rgb = [number, number, number];


const rad = (d: number) => (d * Math.PI) / 180;
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Camera basis: right, up, and toward the camera. */
const camera = (yaw: number, elevation: number) => {
  const [y, e] = [rad(yaw), rad(elevation)];
  const toward: Vec3 = [Math.cos(e) * Math.sin(y), Math.sin(e), Math.cos(e) * Math.cos(y)];
  const right = unit(cross([0, 1, 0], toward));
  const up = cross(toward, right);
  return { right, up, toward };
};

const Z: Vec3 = [0, 0, 1];
const Y: Vec3 = [0, 1, 0];

/** World frames (origin, axis, front, side) for every frame slot in figure.ts's order. */
const frames = (move: Move, t: number, out: Float64Array) => {
  const pose = poseAt(move, t);
  const sk = skeleton(pose);
  const smith = move.props.find((p) => p.kind === "smith");
  let i = 0;
  const put = (o: Vec3, a: Vec3, ref: Vec3, side: number) => {
    const s0 = unit(sub(ref, [a[0] * dot(ref, a), a[1] * dot(ref, a), a[2] * dot(ref, a)]));
    const f = cross(a, s0);
    out.set([o[0], o[1], o[2], a[0], a[1], a[2], f[0], f[1], f[2], s0[0] * side, s0[1] * side, s0[2] * side], i);
    i += 12;
  };
  const bar: Vec2 = pose.grip.at;
  put(sk.pelvis, unit(sub(sk.chest, sk.pelvis)), Z, 1);
  put(sk.neck, unit(sub(sk.head, sk.neck)), Z, 1);
  put([bar[0], bar[1], 0], Z, Y, 1);
  put([smith && smith.kind === "smith" ? smith.x : bar[0], 0, 0], Y, Z, 1);
  for (const side of [1, -1]) {
    const l = side > 0 ? sk.near : sk.far;
    const upper = unit(sub(l.elbow, l.shoulder));
    const fore = unit(sub(l.wrist, l.elbow));
    const bend = cross(upper, fore);
    const elbowRef = Math.hypot(...bend) > 0.05 ? bend : Z;
    put(l.hip, unit(sub(l.knee, l.hip)), Z, side);
    put(l.knee, unit(sub(l.ankle, l.knee)), Z, side);
    put(l.ankle, unit(sub(l.toe, l.heel)), Z, side);
    put(l.shoulder, upper, elbowRef, 1);
    put(l.elbow, fore, elbowRef, 1);
    put(l.wrist, fore, Z, side);
  }
};

const parse = (hex: string): Rgb => {
  const h = hex.trim().replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const css = (c: Rgb) => `rgb(${c.map(Math.round).join(",")})`;

/** Shade ramps per tone, LEVELS steps from the face turned away from the light to the face toward it. */
const palette = (el: Element) => {
  const style = getComputedStyle(el);
  const v = (name: string) => parse(style.getPropertyValue(name));
  const [fg, muted, line, surface] = [v("--fg"), v("--muted"), v("--line"), v("--surface")];
  const soft = mix(muted, surface, luma(fg) > luma(muted) ? VIEW.spread : VIEW.spreadLight);
  const [lo, hi] = luma(fg) > luma(muted) ? [soft, fg] : [fg, soft];
  const ramp = (a: Rgb, b: Rgb, toward = 0) =>
    Array.from({ length: VIEW.levels + 1 }, (_, i) => css(mix(mix(a, b, i / VIEW.levels), surface, toward)));
  const ramps: string[][] = [];
  ramps[Tone.Body] = ramp(lo, hi);
  ramps[Tone.Far] = ramp(lo, hi, VIEW.far);
  const steel = mix(muted, surface, 0.4);
  ramps[Tone.Bar] = luma(muted) > luma(steel) ? ramp(steel, muted) : ramp(muted, steel);
  ramps[Tone.Rail] = ramp(mix(surface, line, 0.7), line);
  return { ramps, floor: css(mix(surface, line, 0.55)) };
};

export type Area = { x: number; y: number; w: number; h: number };

/**
 * Mount a move on a canvas. `area` (CSS px inside the canvas) is where the framed figure
 * goes; it defaults to the whole canvas. Call `draw(t)` with loop time t in [0, 1).
 */
export const mountLoop = (canvas: HTMLCanvasElement, move: Move, area?: Area) => {
  const mesh = buildMesh();
  const { lv, vf, fv, fo, fn, ff, ft, fb, vb } = mesh;
  const nv = vf.length;
  const nf = ft.length;
  const cam = camera(VIEW.yaw, VIEW.elevation);
  const light = unit([
    cam.right[0] * VIEW.light[0] + cam.up[0] * VIEW.light[1] + cam.toward[0] * VIEW.light[2],
    cam.right[1] * VIEW.light[0] + cam.up[1] * VIEW.light[1] + cam.toward[1] * VIEW.light[2],
    cam.right[2] * VIEW.light[0] + cam.up[2] * VIEW.light[1] + cam.toward[2] * VIEW.light[2],
  ]);
  const rim = unit([
    cam.right[0] * VIEW.rim[0] + cam.up[0] * VIEW.rim[1] + cam.toward[0] * VIEW.rim[2],
    cam.right[1] * VIEW.rim[0] + cam.up[1] * VIEW.rim[1] + cam.toward[1] * VIEW.rim[2],
    cam.right[2] * VIEW.rim[0] + cam.up[2] * VIEW.rim[1] + cam.toward[2] * VIEW.rim[2],
  ]);

  const world = new Float64Array(FRAME_COUNT * 12);
  /** Per frame: projected origin and axes (x, y, depth each), then axis·light, then axis·rim. */
  const proj = new Float64Array(FRAME_COUNT * 18);
  const px = new Float32Array(nv);
  const py = new Float32Array(nv);
  const pz = new Float32Array(nv);
  const keys = new Float64Array(nf);
  const shade = new Uint8Array(nf);

  const project = (t: number, k: number, ox: number, oy: number) => {
    frames(move, t, world);
    for (let i = 0; i < FRAME_COUNT; i++) {
      const w = i * 12, p = i * 18;
      for (let j = 0; j < 4; j++) {
        const x = world[w + j * 3]!, y = world[w + j * 3 + 1]!, z = world[w + j * 3 + 2]!;
        const r = x * cam.right[0] + y * cam.right[1] + z * cam.right[2];
        const u = x * cam.up[0] + y * cam.up[1] + z * cam.up[2];
        proj[p + j * 3] = k * r + (j === 0 ? ox : 0);
        proj[p + j * 3 + 1] = -k * u + (j === 0 ? oy : 0);
        proj[p + j * 3 + 2] = x * cam.toward[0] + y * cam.toward[1] + z * cam.toward[2];
        if (j > 0) {
          proj[p + 11 + j] = x * light[0] + y * light[1] + z * light[2];
          proj[p + 14 + j] = x * rim[0] + y * rim[1] + z * rim[2];
        }
      }
    }
    for (let v = 0; v < nv; v++) {
      const p = vf[v]! * 18, t3 = v * 3;
      const a = lv[t3]!, f = lv[t3 + 1]!, s = lv[t3 + 2]!;
      px[v] = proj[p]! + a * proj[p + 3]! + f * proj[p + 6]! + s * proj[p + 9]!;
      py[v] = proj[p + 1]! + a * proj[p + 4]! + f * proj[p + 7]! + s * proj[p + 10]!;
      pz[v] = proj[p + 2]! + a * proj[p + 5]! + f * proj[p + 8]! + s * proj[p + 11]!;
    }
  };

  // Framing: the union of the projected bounds over the whole loop, so nothing swims.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x), maxX = Math.max(maxX, x), minY = Math.min(minY, y), maxY = Math.max(maxY, y);
  };
  for (const t of VIEW.fitAt === null ? Array.from({ length: 24 }, (_, i) => i / 24) : [VIEW.fitAt]) {
    project(t, 1, 0, 0);
    for (let v = 0; v < nv; v++) if (vb[v] === 1 || (vb[v] && VIEW.fit === "all")) grow(px[v]!, py[v]!);
  }
  const floor: Vec3[] = [[FLOOR.x0, 0, -FLOOR.z], [FLOOR.x1, 0, -FLOOR.z], [FLOOR.x1, 0, FLOOR.z], [FLOOR.x0, 0, FLOOR.z]];
  if (VIEW.fit === "all") for (const c of floor) grow(dot(c, cam.right), -dot(c, cam.up));

  const ctx = canvas.getContext("2d")!;
  let colours = palette(canvas);
  let scale = 1, ox = 0, oy = 0;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const a = area ?? { x: 0, y: 0, w: width, h: height };
    const inner = { w: a.w * (1 - 2 * VIEW.pad), h: a.h * (1 - 2 * VIEW.pad) };
    const k = Math.min(inner.w / (maxX - minX), inner.h / (maxY - minY));
    scale = k * dpr;
    ox = (a.x + a.w / 2 - (k * (minX + maxX)) / 2) * dpr;
    oy = (a.y + a.h / 2 - (k * (minY + maxY)) / 2) * dpr;
  };
  resize();

  const draw = (t: number) => {
    project(t, scale, ox, oy);
    let n = 0;
    for (let i = 0; i < nf; i++) {
      const p = ff[i]! * 18, n3 = i * 3;
      const a = fn[n3]!, f = fn[n3 + 1]!, s = fn[n3 + 2]!;
      if (a * proj[p + 5]! + f * proj[p + 8]! + s * proj[p + 11]! <= 1e-3) continue;
      const lit = Math.max(0, a * proj[p + 12]! + f * proj[p + 13]! + s * proj[p + 14]!) ** VIEW.gamma;
      const back = Math.max(0, a * proj[p + 15]! + f * proj[p + 16]! + s * proj[p + 17]!) ** 2;
      shade[i] = Math.round(Math.min(1, VIEW.ambient + (1 - VIEW.ambient) * lit + VIEW.rimStrength * back) * VIEW.levels);
      let depth = 0;
      for (let j = fo[i]!; j < fo[i + 1]!; j++) depth += pz[fv[j]!]!;
      depth = depth / (fo[i + 1]! - fo[i]!) + fb[i]!;
      // Depth and face index in one number, so a plain numeric sort orders the faces.
      keys[n++] = Math.round((depth + 1000) * 64) * 4096 + i;
    }
    const order = keys.subarray(0, n).sort();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineJoin = "bevel";
    ctx.lineWidth = 0.75;

    ctx.beginPath();
    for (const [j, c] of floor.entries()) {
      const x = dot(c, cam.right) * scale + ox, y = -dot(c, cam.up) * scale + oy;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.fillStyle = colours.floor;
    ctx.fill();

    for (let o = 0; o < n; o++) {
      const i = order[o]! % 4096;
      const colour = colours.ramps[ft[i]!]![shade[i]!]!;
      ctx.beginPath();
      const start = fo[i]!;
      ctx.moveTo(px[fv[start]!]!, py[fv[start]!]!);
      for (let j = start + 1; j < fo[i + 1]!; j++) ctx.lineTo(px[fv[j]!]!, py[fv[j]!]!);
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      ctx.fill();
      ctx.stroke();
    }
  };

  return {
    draw,
    resize,
    /** Re-read the theme tokens, e.g. after a colour-scheme change. */
    retheme: () => (colours = palette(canvas)),
    stats: { vertices: nv, faces: nf },
  };
};
