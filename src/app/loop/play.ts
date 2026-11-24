/**
 * The movement loop in the cue card's slot. Loaded with dynamic import() once the screen is
 * idle, so neither this code nor the move data is in the critical JS. The slot already shows
 * the move's poster (the key pose, rendered at build time by the same projector), so the
 * canvas takes over with no visible change and no layout shift.
 */
import { parseMove } from "../../moves/validate.ts";
import { mountLoop } from "./render.ts";

/** What the slot shows: the loop moving, or a still at one of the move's labelled steps. */
export type LoopView =
  | { readonly kind: "playing" }
  | { readonly kind: "still"; readonly step: number; readonly steps: number; readonly label: string };

export type Loop = {
  readonly pause: () => void;
  readonly resume: () => void;
  /** Draws the next (1) or previous (-1) step's key pose, wrapping round the loop. */
  readonly step: (by: 1 | -1) => void;
  readonly stop: () => void;
};

/** Whether the loop moves: the motion setting decides ("auto"), unless the lifter paused or pressed play. */
type Intent = "auto" | "paused" | "playing";

/**
 * Plays the move file `raw` (the parsed JSON of `<id>.json`) in `stage` while it is on screen,
 * the page is visible and motion is welcome. Throws a MoveError, before touching the DOM, when
 * the file is not a valid move. `onView` hears every change of what the slot shows, never per frame.
 */
export const play = (stage: HTMLElement, raw: unknown, id: string, onView: (view: LoopView) => void): Loop => {
  const move = parseMove(raw, id);
  const canvas = document.createElement("canvas");
  canvas.className = "loop-canvas";
  canvas.setAttribute("aria-hidden", "true");
  stage.append(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const loop = mountLoop(canvas, move, { x: 0, y: 0, w: width, h: height });
  const keyT = move.keyframes[move.keyPose]!.t;
  const stepTs = move.steps.map((s) => move.keyframes[s.keyframe]!.t);
  /** The step a loop time belongs to: the last one at or before it, wrapping round the loop. */
  const stepAt = (t: number) => {
    for (let i = stepTs.length - 1; i >= 0; i--) if (stepTs[i]! <= t) return i;
    return stepTs.length - 1;
  };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  let intent: Intent = "auto";
  let onScreen = false;
  let frame = 0;
  // Loop time advances only while playing, so a pause resumes where it left off.
  let phase = keyT;
  let last = 0;
  let shown: number | "playing" | undefined;
  loop.draw(phase);

  const moving = () => intent === "playing" || (intent === "auto" && !reduce.matches);
  const emit = () => {
    const step = stepAt(phase);
    const key = moving() ? "playing" : step;
    if (key === shown) return;
    shown = key;
    onView(key === "playing" ? { kind: "playing" } : { kind: "still", step, steps: stepTs.length, label: move.steps[step]!.label });
  };
  const tick = (now: number) => {
    if (last) phase = (phase + (now - last) / move.durationMs) % 1;
    last = now;
    loop.draw(phase);
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    const run = moving() && onScreen && !document.hidden;
    if (run && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    } else if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    stage.dataset.loop = run ? "playing" : "paused";
    emit();
  };
  const motionSetting = () => {
    // A press of play was an answer to the old setting; a pause stands.
    if (intent === "playing") intent = "auto";
    if (reduce.matches && intent === "auto") loop.draw((phase = keyT));
    update();
  };
  const retheme = () => {
    loop.retheme();
    loop.draw(phase);
  };

  const seen = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? false;
    update();
  });
  seen.observe(stage);
  document.addEventListener("visibilitychange", update);
  reduce.addEventListener("change", motionSetting);
  scheme.addEventListener("change", retheme);
  update();

  return {
    pause: () => {
      intent = "paused";
      update();
    },
    resume: () => {
      intent = "playing";
      update();
    },
    step: (by) => {
      phase = stepTs[(stepAt(phase) + by + stepTs.length) % stepTs.length]!;
      loop.draw(phase);
      emit();
    },
    stop: () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduce.removeEventListener("change", motionSetting);
      scheme.removeEventListener("change", retheme);
      canvas.remove();
      delete stage.dataset.loop;
    },
  };
};
