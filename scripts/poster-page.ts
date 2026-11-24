// Browser side of scripts/posters.ts: draws one move's key pose with the real projector.
import type { Move } from "../src/moves/sample.ts";
import { mountLoop } from "../src/app/loop/render.ts";

declare global {
  interface Window {
    poster: (move: Move, size: number) => void;
  }
}

window.poster = (move, size) => {
  document.body.replaceChildren();
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `display:block;width:${size}px;height:${size}px`;
  document.body.append(canvas);
  mountLoop(canvas, move, { x: 0, y: 0, w: size, h: size }).draw(move.keyframes[move.keyPose]!.t);
};
