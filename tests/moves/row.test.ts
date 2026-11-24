import { describe, expect, test } from "bun:test";
import rowFile from "../../src/moves/chest-supported-row.json";
import type { Move } from "../../src/moves/sample.ts";
import { BODY, ELBOW_RANGE, JOINTS, RANGES, type Vec3 } from "../../src/moves/skeleton.ts";
import { BACK, CHEST, N, dist, fist, fromVertical, handsOff, inTorso, most, nearestBox, onTorso, sampleLoop, sdBox } from "./loop.ts";

const move = rowFile as unknown as Move;
const loop = sampleLoop(move);
const first = loop[0]!.body;
const reach = most(loop, (f) => dist(f.pose.grip.at, f.body.chest));
const elbowBack = (f: (typeof loop)[number]) => -Math.max(inTorso(f.body, f.body.near.elbow).front, inTorso(f.body, f.body.far.elbow).front);
const squeeze = most(loop, elbowBack);

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

  test("the chest stays on the pad: the chest surface keeps one distance to it, in contact", () => {
    const pad = nearestBox(move, onTorso(first, CHEST));
    expect(inTorso(first, pad.at).front).toBeGreaterThan(CHEST.front);
    const gap = sdBox(onTorso(first, CHEST), pad);
    expect(gap).toBeGreaterThanOrEqual(-0.5);
    expect(gap).toBeLessThanOrEqual(1);
    for (const { body } of loop) expect(Math.abs(sdBox(onTorso(body, CHEST), pad) - gap)).toBeLessThan(1e-9);
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
    const pad = nearestBox(move, onTorso(first, CHEST));
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

  test("a pause at the top: the handles hold still at the squeeze for at least 0.25 s", () => {
    const i = loop.indexOf(squeeze);
    const still = (k: number) => dist(loop[(k + N) % N]!.pose.grip.at, squeeze.pose.grip.at) < 1e-9;
    let [a, b] = [i, i];
    while (still(a - 1) && a - 1 > i - N) a--;
    while (still(b + 1) && b + 1 < i + N) b++;
    expect(((b - a) / N) * move.durationMs).toBeGreaterThanOrEqual(250);
  });

  test("neutral neck: the head stays within the squat's neutral band", () => {
    for (const { pose } of loop) {
      expect(pose.joints.neck).toBeGreaterThanOrEqual(-15);
      expect(pose.joints.neck).toBeLessThanOrEqual(5);
    }
  });

  test("feet planted: the heel never moves and the foot stays flat on the footplate", () => {
    const plate = nearestBox(move, [first.near.heel[0], first.near.heel[1] - BODY.ankleHeight, first.near.heel[2]]);
    for (const { body } of loop) {
      expect(dist(body.near.heel, first.near.heel)).toBeLessThan(1e-9);
      expect(Math.abs(body.angles.foot - 90)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(sdBox([body.near.heel[0], body.near.heel[1] - BODY.ankleHeight, body.near.heel[2]], plate))).toBeLessThanOrEqual(0.5);
    }
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
