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

Made by [Snir Sharristh](https://snirsh.codes).
