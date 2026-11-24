import { describe, expect, test } from "bun:test";
import squatFile from "../../src/moves/smith-squat.json";
import { poseAt, type Move } from "../../src/moves/sample.ts";
import { BODY, ELBOW_RANGE, RANGES, skeleton, JOINTS } from "../../src/moves/skeleton.ts";

const move = squatFile as unknown as Move;
const N = 360;
const loop = Array.from({ length: N }, (_, i) => {
  const pose = poseAt(move, i / N);
  return { pose, body: skeleton(pose) };
});
const first = loop[0]!.body;
const bottom = skeleton(poseAt(move, move.keyframes[move.keyPose]!.t));
const midfoot = (BODY.toe - BODY.heel) / 2;

describe("Smith squat loop, sampled 360 times", () => {
  test("hips travel back: at the bottom the hip is well behind where it started", () => {
    expect(bottom.pelvis[0]).toBeLessThan(first.pelvis[0] - 15);
  });

  test("knees track forward over the feet, at most 3 cm past the toes", () => {
    expect(bottom.near.knee[0]).toBeGreaterThan(bottom.near.ankle[0] + 10);
    for (const { body } of loop) expect(body.near.knee[0]).toBeLessThanOrEqual(body.near.toe[0] + 3);
  });

  test("neutral spine: the trunk leans between 0 and 50 degrees and the head stays in line", () => {
    for (const { pose } of loop) {
      expect(pose.joints.trunk).toBeGreaterThanOrEqual(0);
      expect(pose.joints.trunk).toBeLessThanOrEqual(50);
      expect(Math.abs(pose.joints.trunk + pose.joints.neck)).toBeLessThanOrEqual(30);
    }
  });

  test("heels stay down (within 2 mm between keyframes, under 0.1 px in the slot) and feet stay flat", () => {
    for (const { body } of loop) {
      expect(Math.abs(body.near.heel[1] - BODY.ankleHeight)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(body.near.heel[0] + BODY.heel)).toBeLessThanOrEqual(0.2);
      expect(body.angles.foot).toBeCloseTo(90, 3);
    }
  });

  test("the bar stays over mid-foot: a vertical Smith path within 1 cm", () => {
    for (const { pose } of loop) expect(Math.abs(pose.grip.at[0] - midfoot)).toBeLessThanOrEqual(1);
  });

  test("the bar stays on the upper back, within 3 cm of where the keyframes put it", () => {
    for (const { pose, body } of loop) {
      const back = Math.hypot(pose.grip.at[0] - body.chest[0], pose.grip.at[1] - body.chest[1]);
      expect(back).toBeGreaterThan(4);
      expect(back).toBeLessThan(11);
    }
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

describe("forward kinematics", () => {
  test("standing straight puts the ankle at ankle height under the hip and the shoulder a torso above it", () => {
    const s = skeleton({ root: [0, 92], joints: { trunk: 0, neck: 0, hip: 0, knee: 0, ankle: 0 }, grip: { at: [0, 60], halfWidth: 20, pole: [-1, 0, 0] } });
    expect(s.near.ankle[0]).toBeCloseTo(0, 9);
    expect(s.near.ankle[1]).toBeCloseTo(92 - BODY.thigh - BODY.shin, 9);
    expect(s.chest[1]).toBeCloseTo(92 + BODY.torso, 9);
    expect(s.near.toe[0]).toBeCloseTo(BODY.toe, 9);
  });

  test("hip flexed 90 points the thigh straight ahead; knee flexed 90 then points the shin down", () => {
    const s = skeleton({ root: [0, 50], joints: { trunk: 0, neck: 0, hip: 90, knee: 90, ankle: 0 }, grip: { at: [0, 60], halfWidth: 20, pole: [-1, 0, 0] } });
    expect(s.near.knee[0]).toBeCloseTo(BODY.thigh, 9);
    expect(s.near.knee[1]).toBeCloseTo(50, 9);
    expect(s.near.ankle[0]).toBeCloseTo(BODY.thigh, 9);
    expect(s.near.ankle[1]).toBeCloseTo(50 - BODY.shin, 9);
  });

  test("the hands land on the grip and the arm keeps its segment lengths", () => {
    const s = skeleton({ root: [0, 92], joints: { trunk: 0, neck: 0, hip: 0, knee: 0, ankle: 0 }, grip: { at: [30, 130], halfWidth: 22, pole: [0, -1, 0] } });
    const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    expect(d(s.near.grip, [30, 130, 22])).toBeLessThan(1e-9);
    expect(d(s.near.shoulder, s.near.elbow)).toBeCloseTo(BODY.upperArm, 9);
    expect(d(s.near.elbow, s.near.wrist)).toBeCloseTo(BODY.forearm, 9);
    expect(s.near.elbow[1]).toBeLessThan(s.near.shoulder[1]);
  });
});
