import { describe, expect, test } from "bun:test";
import benchFile from "../../src/moves/bench-press.json";
import type { Move } from "../../src/moves/sample.ts";
import { BODY, ELBOW_RANGE, JOINTS, RANGES } from "../../src/moves/skeleton.ts";
import { BLADES, CHEST, GLUTES, SKULL, dist, fromVertical, handsOff, most, nearestBox, onHead, onTorso, sampleLoop, sdBox } from "./loop.ts";

const move = benchFile as unknown as Move;
const loop = sampleLoop(move);
const first = loop[0]!.body;
const lockout = most(loop, (f) => f.pose.grip.at[1]);
const bottom = most(loop, (f) => -f.pose.grip.at[1]);
const floor = move.props.find((p) => p.kind === "floor");

describe("Bench press loop, sampled 360 times", () => {
  test("lies supine and flat: the trunk within 5 degrees of horizontal, head toward -x, chest up", () => {
    for (const { pose, body } of loop) {
      expect(Math.abs(pose.joints.trunk + 90)).toBeLessThanOrEqual(5);
      expect(body.head[0]).toBeLessThan(body.chest[0]);
      expect(body.chest[0]).toBeLessThan(body.pelvis[0]);
      expect(onTorso(body, CHEST)[1]).toBeGreaterThan(body.pelvis[1] + 10);
    }
  });

  test("the pelvis stays still with the glutes on the bench pad", () => {
    const glutes = onTorso(first, GLUTES);
    const pad = nearestBox(move, glutes);
    expect(pad.at[1]).toBeLessThan(first.pelvis[1]);
    for (const { body } of loop) {
      expect(dist(body.pelvis, first.pelvis)).toBeLessThan(1e-9);
      expect(Math.abs(sdBox(onTorso(body, GLUTES), pad))).toBeLessThanOrEqual(0.5);
    }
  });

  // A padded bench gives a little: each contact may sink up to 2.5 cm into the cushion, or float 0.5 cm over it.
  test("the bench is flat and the whole torso and the head rest on it: glutes, shoulder blades and the back of the skull", () => {
    const pad = nearestBox(move, onTorso(first, GLUTES));
    expect(pad.tilt ?? 0).toBe(0);
    for (const { body } of loop)
      for (const point of [onTorso(body, GLUTES), onTorso(body, BLADES), onHead(body, SKULL)]) {
        expect(sdBox(point, pad)).toBeGreaterThanOrEqual(-2.5);
        expect(sdBox(point, pad)).toBeLessThanOrEqual(0.5);
      }
  });

  // The rig has no shoulder-girdle joint, so this checks the shoulder points stay where they start
  // (the set position the keyframes put them in), not retraction itself.
  test("the shoulder joints never ride up or slide: they stay where the rep starts", () => {
    for (const { body } of loop) {
      expect(dist(body.near.shoulder, first.near.shoulder)).toBeLessThan(1e-9);
      expect(dist(body.far.shoulder, first.far.shoulder)).toBeLessThan(1e-9);
    }
  });

  test("lockout: the bar is straight over the shoulder joints, arms all but straight", () => {
    expect(Math.abs(lockout.pose.grip.at[0] - lockout.body.chest[0])).toBeLessThanOrEqual(2);
    expect(lockout.body.elbow).toBeLessThanOrEqual(15);
  });

  test("bottom: the bar touches the lower chest, 12 to 18 cm toward the feet from the shoulder joints", () => {
    const [x, y] = bottom.pose.grip.at;
    expect(x - bottom.body.chest[0]).toBeGreaterThanOrEqual(12);
    expect(x - bottom.body.chest[0]).toBeLessThanOrEqual(18);
    expect(y - onTorso(bottom.body, CHEST)[1]).toBeGreaterThanOrEqual(0);
    expect(y - onTorso(bottom.body, CHEST)[1]).toBeLessThanOrEqual(3);
  });

  test("the bar path stays between the shoulder joints and the lower chest and never sinks into the chest", () => {
    for (const { pose, body } of loop) {
      expect(pose.grip.at[0] - body.chest[0]).toBeGreaterThanOrEqual(-2);
      expect(pose.grip.at[0] - body.chest[0]).toBeLessThanOrEqual(18);
      expect(pose.grip.at[1]).toBeGreaterThanOrEqual(onTorso(body, CHEST)[1]);
    }
  });

  test("forearms within 15 degrees of vertical at the bottom, seen from the side", () => {
    expect(fromVertical(bottom.body.near.elbow, bottom.body.near.wrist)).toBeLessThanOrEqual(15);
  });

  test("feet planted: the heel never moves and the foot stays flat on the floor", () => {
    expect(floor?.kind).toBe("floor");
    for (const { body } of loop) {
      expect(dist(body.near.heel, first.near.heel)).toBeLessThan(1e-9);
      expect(Math.abs(body.near.heel[1] - BODY.ankleHeight - (floor?.kind === "floor" ? floor.y : NaN))).toBeLessThanOrEqual(0.1);
      expect(Math.abs(body.angles.foot - 90)).toBeLessThanOrEqual(0.01);
    }
  });

  test("neutral neck: the head in line with the trunk, within 5 degrees", () => {
    for (const { pose } of loop) expect(Math.abs(pose.joints.neck)).toBeLessThanOrEqual(5);
  });

  test("knees bent about 90 degrees", () => {
    for (const { pose } of loop) {
      expect(pose.joints.knee).toBeGreaterThanOrEqual(85);
      expect(pose.joints.knee).toBeLessThanOrEqual(95);
    }
  });

  test("feet slightly behind the knees: the ankle 2 to 12 cm toward the head from the knee", () => {
    for (const { body } of loop) {
      expect(body.near.knee[0] - body.near.ankle[0]).toBeGreaterThanOrEqual(2);
      expect(body.near.knee[0] - body.near.ankle[0]).toBeLessThanOrEqual(12);
    }
  });

  test("hands just outside shoulder width, and they never let go of the bar", () => {
    expect(move.grip.halfWidth).toBeGreaterThanOrEqual(BODY.shoulderHalfWidth + 6);
    expect(move.grip.halfWidth).toBeLessThanOrEqual(BODY.shoulderHalfWidth + 18);
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
