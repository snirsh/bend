/**
 * The movement loop in the cue card's slot. Loaded with dynamic import() once the screen is
 * idle, so neither this code nor the move data is in the critical JS. The slot already shows
 * the move's poster (the key pose, rendered at build time by the same projector), so the
 * canvas takes over with no visible change and no layout shift.
 */
import type { Move } from "../../moves/sample.ts";
import { mountLoop } from "./render.ts";

/** The label strip at the bottom of the slot that the figure keeps clear of, CSS px. */
const LABEL = 12;

/** Plays `move` in `slot` while the slot is on screen, the page is visible and motion is welcome. Returns a stop function. */
export const play = (slot: HTMLElement, move: Move): (() => void) => {
  const canvas = document.createElement("canvas");
  canvas.className = "loop-canvas";
  canvas.setAttribute("aria-hidden", "true");
  slot.append(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  const loop = mountLoop(canvas, move, { x: 0, y: 0, w: width, h: height - LABEL });
  const keyT = move.keyframes[move.keyPose]!.t;
  loop.draw(keyT);
  slot.dataset.loop = "ready";

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  let onScreen = false;
  let frame = 0;
  // Loop time advances only while playing, so a pause resumes where it left off.
  let phase = keyT;
  let last = 0;

  const tick = (now: number) => {
    if (last) phase = (phase + (now - last) / move.durationMs) % 1;
    last = now;
    loop.draw(phase);
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    const run = onScreen && !document.hidden && !reduce.matches;
    if (run && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    } else if (!run && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (!run && reduce.matches) loop.draw((phase = keyT));
    slot.dataset.loop = run ? "playing" : "paused";
  };
  const retheme = () => {
    loop.retheme();
    loop.draw(phase);
  };

  const seen = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? false;
    update();
  });
  seen.observe(slot);
  document.addEventListener("visibilitychange", update);
  reduce.addEventListener("change", update);
  scheme.addEventListener("change", retheme);

  return () => {
    cancelAnimationFrame(frame);
    seen.disconnect();
    document.removeEventListener("visibilitychange", update);
    reduce.removeEventListener("change", update);
    scheme.removeEventListener("change", retheme);
    canvas.remove();
    delete slot.dataset.loop;
  };
};
