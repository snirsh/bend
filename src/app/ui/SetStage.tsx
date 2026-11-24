import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { useId, useState } from "react";
import { INCREMENTS_KG } from "../../engine/config.ts";
import type { LoggedSet, Mode } from "../../engine/types.ts";
import type { UpNext } from "../workout.ts";
import { activePlan } from "./useSession.ts";

/** RIR choices. "4+" logs 4: progression only asks whether RIR is at most 2. */
const RIR = ["0", "1", "2", "3", "4"] as const;

const formatKg = (kg: number) => String(Math.round(kg * 100) / 100);

type Props = {
  readonly next: UpNext;
  readonly label: string;
  readonly mode: Mode;
  readonly onLog: (set: LoggedSet) => void;
};

/** The set being logged: big weight and reps fields, RIR, and the Log set button. Remount per set. */
export const SetStage = ({ next, label, mode, onLog }: Props) => {
  const [weight, setWeight] = useState<number | null>(next.weight);
  const [reps, setReps] = useState<number | null>(next.reps);
  const [rir, setRir] = useState<string | null>(next.last ? String(Math.min(next.last.rir, 4)) : null);
  const ids = { weight: useId(), reps: useId(), rir: useId(), hint: useId() };
  const exercise = activePlan.catalog.find((e) => e.id === next.exercise.exerciseId);
  const increment = exercise ? INCREMENTS_KG[exercise.equipment] : 2.5;
  const { last } = next;
  const missing = weight === null ? "a weight" : reps === null ? "reps" : rir === null ? "RIR" : null;

  const submit = () => {
    if (weight === null || reps === null || rir === null) return;
    onLog({ weight, reps, rir: Number(rir) });
  };

  return (
    <section className="now" aria-labelledby={`${ids.weight}-title`}>
      <div className="now-head">
        <span className="kicker">Up next</span>
        {mode !== "normal" && (
          <span className="mode-badge">
            {mode}
            {next.exercise.targetRpe !== undefined && ` · RPE ${next.exercise.targetRpe}`}
          </span>
        )}
      </div>
      <div className="now-title">
        <h2 id={`${ids.weight}-title`}>
          {label} · set {next.slot.setIndex + 1} of {next.exercise.targetSets}
        </h2>
        <div className="last">{last ? `last ${formatKg(last.weight)} × ${last.reps}` : "first time"}</div>
      </div>
      <form
        className="stage"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="big-meta">
          <label className="big-lab" htmlFor={ids.weight}>
            Weight
          </label>
          <span className="last">{weight === null ? "pick a starting weight" : `kg · ±${formatKg(increment)}`}</span>
        </div>
        <NumberInput value={weight} onValueChange={setWeight} min={increment} max={500} step={increment} largeStep={increment * 4}>
          <NumberInputGroup className="big-field">
            <NumberInputDecrement className="step" aria-label="Decrease weight">
              −
            </NumberInputDecrement>
            <NumberInputControl
              id={ids.weight}
              className="big-num"
              inputMode="decimal"
              placeholder="kg"
              autoFocus={next.weight === null}
              enterKeyHint="next"
            />
            <NumberInputIncrement className="step" aria-label="Increase weight">
              +
            </NumberInputIncrement>
          </NumberInputGroup>
        </NumberInput>

        <div className="big-meta">
          <label className="big-lab" htmlFor={ids.reps}>
            Reps
          </label>
          <span className="last">{last ? `last ${last.reps}` : `target ${next.exercise.targetReps}`}</span>
        </div>
        <NumberInput value={reps} onValueChange={setReps} min={0} max={100} step={1}>
          <NumberInputGroup className="big-field">
            <NumberInputDecrement className="step" aria-label="Decrease reps">
              −
            </NumberInputDecrement>
            <NumberInputControl id={ids.reps} className="big-num" inputMode="numeric" enterKeyHint="done" />
            <NumberInputIncrement className="step" aria-label="Increase reps">
              +
            </NumberInputIncrement>
          </NumberInputGroup>
        </NumberInput>

        <div className="big-meta">
          <span className="big-lab" id={ids.rir}>
            RIR
          </span>
          <span className="last">{last ? `last ${last.rir}` : "reps in reserve"}</span>
        </div>
        <SegmentedControl className="rir-seg" value={rir} onValueChange={setRir} aria-labelledby={ids.rir}>
          {RIR.map((v) => (
            <SegmentedControlItem key={v} value={v} aria-label={v === "4" ? "4 or more" : v}>
              {v === "4" ? "4+" : v}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <button className="log-btn" type="submit" disabled={missing !== null} aria-describedby={missing ? ids.hint : undefined}>
          Log set
        </button>
        {missing && (
          <p className="log-hint" id={ids.hint}>
            Pick {missing} to log this set.
          </p>
        )}
      </form>
    </section>
  );
};
