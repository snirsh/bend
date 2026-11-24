# bend

Personal gym progressive web app.

Rotating full-body A/B/C sessions (~45 min) built from antagonist supersets.

```sh
bun install
bun test
bun run typecheck
```

## Engine

`nextSession(history, plan, today)` in `src/engine` is a pure function. It returns the prescription for the next session. `today` is a `CalendarDate` (`calendarDate("2026-11-24")`, years 1900–9999), and the engine never reads the clock.

**Logged history.** `nextSession` checks the history first and throws a `RangeError` naming the session date and exercise id when:

- an exercise is logged with zero sets.
- a weight is not a finite number above 0. Weight is external load in kg. Bodyweight moves are out of scope for now.
- reps is not an integer ≥ 0.
- RIR is not an integer from 0 to 10.

**Letter.** The next letter follows the latest logged session, A → B → C → A, and starts at A with no history. Gaps never reset the rotation. Sessions on the same date keep their order in the input array, so the last one listed counts as the latest.

**Mode.** The gap is the number of calendar days since the last session.

| Gap | Mode | Sets | Weight |
| --- | --- | --- | --- |
| 0–6 | normal | plan | progression |
| 7–13 | deload | plan − 1, min 1 | 90%, rounded down to the increment |
| ≥ 14 | bridge | min(2, plan) | compounds 80% at RPE 5, isolations 90%, rounded down |

A bridge lasts 14 days from the first session after the gap, and a return inside that window stays in bridge mode. In bridge mode, `plan.bridgeSwaps` applies (Romanian deadlift → leg curl). A new gap of 14 days or more restarts the bridge. Modes come from dates and are never stored.

**Double progression, per exercise.** Only normal sessions without a `rough-night` tag count.

- Every set at or above the range top with RIR ≤ 2: add one increment and aim for the range bottom.
- Any set below the range bottom: miss. Hold the first time. Step down one increment on the second miss in a row.
- Otherwise: hold, and aim one rep past the weakest set.
- Rough-night, deload and bridge sessions neither extend nor reset a miss streak.
- A lighter prescription (step-down, deload, bridge) never goes below one increment. If the weight was already lighter than that, it holds.
- An exercise that was never logged gets `weight: null`, so the lifter picks a starting weight.

**Increments** (`INCREMENTS_KG`): barbell 2.5, smith 2.5, dumbbell 2, cable 2.5, machine 2.5.

`src/plan/plan.ts` holds the move catalog and PPL days. The A/B/C split and the superset pairs are still open (`TODO(sous-chef)`).

## App

The in-workout logging screen is a Vite + Preact (React compat) PWA in `src/app`. It works offline, has no backend and makes no network calls beyond its own files.

```sh
bun install
bun run dev        # http://localhost:47311
bun run build      # dist/, with dist/sw.js listing every built file
bun run preview    # serves dist/ on http://localhost:47310
bun run size       # fails when dist/ breaks docs/perf-budget.md
PORT=47320 bun run e2e  # PORT moves preview and Playwright; DEV_PORT moves dev
bun run e2e        # Playwright against the preview build
```

`bun test` runs only `tests/` (see `bunfig.toml`). The Playwright specs in `e2e/` need a fresh `bun run build`. `PROOF=1 bun run e2e e2e/proof.spec.ts` also writes screenshots, a video and the INP measurement outside the repo.

**Screen.** The engine prescribes the session from the history in IndexedDB and the device's local date. Sets run in superset order (A1, B1, A2, B2, then straight sets). Weight comes from the prescription, or from the last set logged this session for that exercise. Reps come from the same set last time, or the target. Log set saves the set and starts the 2:00 rest. Finish saves the session and starts the 5:00 cooldown. The workout in progress is saved after every change, so a reload resumes it.

**Movement loop.** The cue card's 88 px slot first shows a poster of the move's key pose, `public/moves/<id>-<dark|light>.webp`, so the first paint costs no JS. Once the screen is idle it loads the loop code and the move's file as lazy chunks, checks the file with `parseMove` (`src/moves/validate.ts`) and draws the loop on a canvas over the poster. An invalid file logs one warning and the poster stays as the still. The loop draws only while the page is visible and the slot is on screen. A pause button stops it (WCAG 2.2.2). Paused, or under reduced motion, the slot shows the key pose with previous and next buttons through the move's labelled steps. Reduced motion is followed live, and a pause stands through it. A new move is one file, `src/moves/<id>.json` with a catalog id, then `bun run posters` to render its two posters.

**Timers** store absolute end times and recompute on every tick and whenever the page is shown again, so they stay right through a screen lock. A notification at the end appears only when notifications were already allowed, which you can do from the menu.

**Offline.** After the first load, the service worker serves the whole app from its cache. A new build gets a new cache name. When the new worker takes over it keeps the previous cache for one more version, so a page still open on the old build can lazy-load its loop, and deletes older ones.

**Export and import** live in the ⋯ menu. Export downloads every stored session as JSON (`app: "bend"`, `schemaVersion: 1`). Import checks the whole file with the engine's rules and rejects it with the reason if anything is wrong. A valid file is merged: sessions you already have are skipped, and nothing stored is removed or replaced.

**Dev fixture.** The real A/B/C split in `src/plan/plan.ts` is still empty, so every day runs `src/app/dev-fixture.ts`: Smith squat + chest supported row, then bench press, with fixture cue texts. The app shows a "dev fixture" chip while it is in use. It is not the real split.

Made by [Snir Sharristh](https://snirsh.codes).
