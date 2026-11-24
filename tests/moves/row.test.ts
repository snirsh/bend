import { describe, expect, test } from "bun:test";
import rowFile from "../../src/moves/chest-supported-row.json";
import type { Move } from "../../src/moves/sample.ts";
import { BODY, ELBOW_RANGE, JOINTS, RANGES, type Vec3 } from "../../src/moves/skeleton.ts";
import { BACK, CHEST, N, boxes, dist, fist, fromVertical, handsOff, inTorso, most, nearestBox, onFloor, onTorso, sampleLoop, sdBox, touch } from "./loop.ts";

const move = rowFile as unknown as Move;
const loop = sampleLoop(move);
const first = loop[0]!.body;
const reach = most(loop, (f) => dist(f.pose.grip.at, f.body.chest));
const elbowBack = (f: (typeof loop)[number]) => -Math.max(inTorso(f.body, f.body.near.elbow).front, inTorso(f.body, f.body.far.elbow).front);
const squeeze = most(loop, elbowBack);
const pad = nearestBox(move, onTorso(first, CHEST));
const floor = move.props.find((p) => p.kind === "floor");
const floorY = floor?.kind === "floor" ? floor.y : 0;
/** The boxes that stand on the floor and hold the chest pad up. */
const posts = boxes(move).filter((b) => b !== pad && onFloor(b, floorY) && touch(b, pad));
const deg = (r: number) => (r * 180) / Math.PI;

describe("Chest-supported row loop, sampled 360 times", () => {
  test("the torso is fixed: pelvis and trunk never move, leaning forward onto the pad", () => {
    for (const { pose, body } of loop) {
      expect(dist(body.pelvis, first.pelvis)).toBeLessThan(1e-9);
      expect(dist(body.chest, first.chest)).toBeLessThan(1e-9);
      expect(pose.joints.trunk).toBeCloseTo(loop[0]!.pose.joints.trunk, 9);
      expect(pose.joints.trunk).toBeGreaterThan(15);
      expect(pose.joints.trunk).toBeLessThan(75);
    }
  });

  test("the chest pad inclines 30 to 45 degrees from the floor, along the trunk", () => {
    expect(pad.tilt ?? 0).toBeGreaterThanOrEqual(30);
    expect(pad.tilt ?? 0).toBeLessThanOrEqual(45);
    expect(Math.abs((pad.tilt ?? 0) - (90 - loop[0]!.pose.joints.trunk))).toBeLessThanOrEqual(3);
  });

  test("the chest stays on the pad: the chest surface keeps one distance to it, in contact", () => {
    expect(inTorso(first, pad.at).front).toBeGreaterThan(CHEST.front);
    const gap = sdBox(onTorso(first, CHEST), pad);
    expect(gap).toBeGreaterThanOrEqual(-0.5);
    expect(gap).toBeLessThanOrEqual(1);
    for (const { body } of loop) expect(Math.abs(sdBox(onTorso(body, CHEST), pad) - gap)).toBeLessThan(1e-9);
  });

  test("the chest pad stands on a post that rises from the floor into it", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  test("the machine stands: every box is joined to the floor through boxes that touch", () => {
    const all = boxes(move);
    const held = new Set(all.filter((b) => onFloor(b, floorY)));
    for (let grew = true; grew; ) {
      grew = false;
      for (const b of all) if (!held.has(b) && [...held].some((h) => touch(b, h))) held.add(b), (grew = true);
    }
    expect(all.filter((b) => !held.has(b))).toEqual([]);
  });

  test("seated: the hip joint sits 6 to 13 cm over the seat top, inside its footprint", () => {
    const seat = nearestBox(move, [first.pelvis[0], first.pelvis[1] - 10, 0]);
    const top = seat.at[1] + seat.size[1] / 2;
    expect(seat.tilt ?? 0).toBe(0);
    expect(Math.abs(first.pelvis[0] - seat.at[0])).toBeLessThan(seat.size[0] / 2);
    for (const { body } of loop) {
      expect(body.pelvis[1] - top).toBeGreaterThanOrEqual(6);
      expect(body.pelvis[1] - top).toBeLessThanOrEqual(13);
    }
  });

  test("the arms and hands pass beside the chest pad, never through it", () => {
    const along = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    for (const { body } of loop)
      for (const l of [body.near, body.far])
        for (const [a, b] of [[l.shoulder, l.elbow], [l.elbow, l.wrist], [l.wrist, fist(l)]] as const)
          for (let k = 0; k <= 10; k++) expect(sdBox(along(a, b, k / 10), pad)).toBeGreaterThanOrEqual(5);
  });

  test("at the start the arms hang straight down to the handles", () => {
    const { body } = reach;
    expect(body.elbow).toBeLessThanOrEqual(20);
    expect(fist(body.near)[1]).toBeLessThan(body.near.shoulder[1] - 40);
    expect(fromVertical(body.near.shoulder, fist(body.near))).toBeLessThanOrEqual(20);
  });

  test("at the top the elbows travel behind the back", () => {
    expect(inTorso(squeeze.body, squeeze.body.near.elbow).front).toBeLessThan(BACK);
    expect(inTorso(squeeze.body, squeeze.body.far.elbow).front).toBeLessThan(BACK);
    expect(elbowBack(reach)).toBeLessThan(0);
  });

  test("a short pause at the top: the handles hold still at the squeeze for 0.25 to 0.8 s", () => {
    const i = loop.indexOf(squeeze);
    const still = (k: number) => dist(loop[(k + N) % N]!.pose.grip.at, squeeze.pose.grip.at) < 1e-9;
    let [a, b] = [i, i];
    while (still(a - 1) && a - 1 > i - N) a--;
    while (still(b + 1) && b + 1 < i + N) b++;
    expect(((b - a) / N) * move.durationMs).toBeGreaterThanOrEqual(250);
    expect(((b - a) / N) * move.durationMs).toBeLessThanOrEqual(800);
  });

  test("neutral neck: the head in line with the trunk, within 5 degrees", () => {
    for (const { pose } of loop) expect(Math.abs(pose.joints.neck)).toBeLessThanOrEqual(5);
  });

  test("feet planted: the heel never moves and the foot stays flat on the floor or a foot platform", () => {
    const sole = (body: (typeof loop)[number]["body"]): Vec3 => [body.near.heel[0], body.near.heel[1] - BODY.ankleHeight, body.near.heel[2]];
    const plate = nearestBox(move, sole(first));
    const onFloor = floor?.kind === "floor" && Math.abs(sole(first)[1] - floor.y) <= 0.5;
    for (const { body } of loop) {
      expect(dist(body.near.heel, first.near.heel)).toBeLessThan(1e-9);
      expect(Math.abs(body.angles.foot - 90)).toBeLessThanOrEqual(0.01);
      expect(onFloor || Math.abs(sdBox(sole(body), plate)) <= 0.5).toBe(true);
    }
  });

  test("the handles ride lever arms: every sampled handle is exactly one lever length from the pivot", () => {
    expect(move.lever).toBeDefined();
    const { pivot, length } = move.lever!;
    for (const { pose } of loop) expect(Math.abs(dist(pose.grip.at, pivot) - length)).toBeLessThan(1e-9);
  });

  test("the lever swings the handles through at least 25 degrees of its arc, on a pivot the machine holds in front of the chest", () => {
    const { pivot } = move.lever!;
    const angle = (f: (typeof loop)[number]) => Math.atan2(f.pose.grip.at[1] - pivot[1], f.pose.grip.at[0] - pivot[0]);
    expect(Math.abs(deg(angle(squeeze) - angle(reach)))).toBeGreaterThanOrEqual(25);
    expect(pivot[0]).toBeGreaterThan(onTorso(first, CHEST)[0]);
    expect(sdBox([pivot[0], pivot[1], 0], nearestBox(move, [pivot[0], pivot[1], 0]))).toBeLessThanOrEqual(0);
  });

  test("the levers hang from the pad's post: the pivot sits in it, and at the start the handles hang below it", () => {
    const { pivot } = move.lever!;
    expect(posts.some((b) => sdBox([pivot[0], pivot[1], 0], b) <= 0)).toBe(true);
    const handle = reach.pose.grip.at;
    expect(handle[1]).toBeLessThan(pivot[1]);
    expect(fromVertical(pivot, handle)).toBeLessThanOrEqual(15);
  });

  test("the hands never let go of the handles", () => {
    for (const { body } of loop) expect(handsOff(body)).toBeLessThan(1e-6);
  });

  test("every joint stays inside its anatomical range, elbows included", () => {
    for (const { pose, body } of loop) {
      for (const j of JOINTS) {
        expect(pose.joints[j]).toBeGreaterThanOrEqual(RANGES[j][0]);
        expect(pose.joints[j]).toBeLessThanOrEqual(RANGES[j][1]);
      }
      expect(body.elbow).toBeGreaterThanOrEqual(ELBOW_RANGE[0]);
      expect(body.elbow).toBeLessThanOrEqual(ELBOW_RANGE[1]);
    }
  });
});
