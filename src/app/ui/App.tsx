import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { useEffect, useId, useRef, useState } from "react";
import type { ExerciseId, LoggedSession, PrescribedExercise } from "../../engine/types.ts";
import { devFixtureCues, type Cue } from "../dev-fixture.ts";
import { COOLDOWN_MS, REST_MS, pause, resume, skip, start, type TimerView } from "../timer.ts";
import { upNext, type InProgress, type SetSlot } from "../workout.ts";
import { Menu } from "./Menu.tsx";
import { SetStage } from "./SetStage.tsx";
import { activePlan, useSession, usingFixture } from "./useSession.ts";
import { useTimers, type TimerAction } from "./useTimers.ts";

const cueFor = (id: ExerciseId, name: string): Cue =>
  devFixtureCues[id] ?? { label: name, tag: name.split(" ")[0] ?? name, cue: "", hint: "" };

const nameOf = (id: ExerciseId) => activePlan.catalog.find((e) => e.id === id)?.name ?? id;

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const kg = (n: number) => String(Math.round(n * 100) / 100);

export const App = () => {
  const session = useSession();
  const timers = useTimers();
  const { phase } = session;

  return (
    <div className="app">
      {phase.kind === "active" && <Active workout={phase.workout} history={phase.history} session={session} timers={timers} />}
      {phase.kind === "finished" && <Finished logged={phase.session} session={session} timers={timers} />}
      {phase.kind === "loading" && <AppBar meta="loading" session={session} />}
      {phase.kind === "failed" && (
        <>
          <AppBar meta="could not open storage" session={session} />
          <main className="main">
            <p className="notice" data-tone="error" role="alert">
              {phase.message}
            </p>
          </main>
        </>
      )}
      <footer className="credit">
        <a href="https://snirsh.codes">made by Snir Sharristh</a>
      </footer>
    </div>
  );
};

type SessionApi = ReturnType<typeof useSession>;
type TimersApi = ReturnType<typeof useTimers>;

const AppBar = ({ meta, session }: { meta: string; session: SessionApi }) => (
  <header className="appbar">
    <div>
      <p className="brand">bend</p>
      <div className="meta">{meta}</div>
    </div>
    <div className="appbar-end">
      {usingFixture && <span className="chip">dev fixture</span>}
      <Menu session={session} />
    </div>
  </header>
);

/** Superset number among the day's superset blocks, for "superset 2 of 5". */
const blockMeta = (workout: InProgress, slot: SetSlot | undefined): string => {
  const supersets = new Set(workout.order.filter((o) => isSuperset(workout, o.block)).map((o) => o.block));
  if (!slot) return "all sets logged";
  if (!supersets.has(slot.block)) return `straight sets · block ${slot.block + 1} of ${new Set(workout.order.map((o) => o.block)).size}`;
  const n = [...supersets].sort((a, b) => a - b).indexOf(slot.block) + 1;
  return `superset ${n} of ${supersets.size}`;
};

const isSuperset = (workout: InProgress, block: number) =>
  new Set(workout.order.filter((o) => o.block === block).map((o) => o.exerciseId)).size > 1;

const Active = ({
  workout,
  history,
  session,
  timers,
}: {
  workout: InProgress;
  history: readonly LoggedSession[];
  session: SessionApi;
  timers: TimersApi;
}) => {
  const next = upNext(workout, history);
  const slot = next?.slot;
  const { letter, mode } = workout.prescription;
  const blockSlots = slot ? workout.order.filter((o) => o.block === slot.block) : [];
  const blockIds = [...new Set(blockSlots.map((o) => o.exerciseId))];
  const pairTitle = blockIds.map((id) => cueFor(id, nameOf(id)).label).join(" + ");
  const resting = timers.views.rest.kind === "running" && !timers.views.rest.done;
  const current = next ? cueFor(next.exercise.exerciseId, next.exercise.name) : null;
  const sub = !current
    ? ""
    : blockIds.length > 1
      ? `Antagonist pair · ${resting ? `resting, then ${current.label.toLowerCase()}` : `${current.label.toLowerCase()} next`}`
      : `Straight sets · ${next?.exercise.name ?? ""}`;
  const finishNow = async () => {
    if (await session.finish()) {
      timers.act("rest", skip);
      timers.act("cooldown", start);
    }
  };

  return (
    <>
      <AppBar
        meta={`session ${letter}${mode === "normal" ? "" : ` · ${mode}`} · ${blockMeta(workout, slot)}`}
        session={session}
      />
      <main className="main">
        {next && current ? (
          <>
            <div className="pair">
              <h1>{pairTitle}</h1>
              <div className="sub">{sub}</div>
            </div>
            <LoopAndCue exercise={next.exercise} cue={current} />
            <SetStage
              key={`${workout.logged.length}:${JSON.stringify(next)}`}
              next={next}
              label={current.label}
              mode={mode}
              onLog={(set) => {
                session.log(set);
                timers.act("rest", start);
              }}
            />
          </>
        ) : (
          <section className="now done-card" aria-labelledby="all-logged">
            <span className="kicker">Session {letter}</span>
            <div className="now-title">
              <h2 id="all-logged">All sets logged</h2>
            </div>
            <p>Save the session, then cool down.</p>
            <button className="log-btn" type="button" onClick={() => void finishNow()}>
              Finish session
            </button>
          </section>
        )}
        <Ticker workout={workout} next={next ? { weight: next.weight, reps: next.reps } : null} />
        <RoughNight checked={workout.tags.includes("rough-night")} onChange={session.roughNight} />
        <TimerCards timers={timers} />
      </main>
    </>
  );
};

const LoopAndCue = ({ exercise, cue }: { exercise: PrescribedExercise; cue: Cue }) => (
  <div className="loop-row">
    {/* Slot for the movement loop (a later change). A still frame until then. */}
    <div className="loop" role="img" aria-label={`Movement loop slot for ${cue.label.toLowerCase()}, still frame`}>
      <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <circle cx="34" cy="10" r="4.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M32 14.6 L22 26 L16 24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 26 L20 36 L12 50" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 36 L30 50" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M19 28 L8 22 L6 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 22 L18 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="loop-label" aria-hidden="true">
        loop
      </span>
    </div>
    <div className="cue">
      <div className="cue-head">
        <span className="kicker">Cue · {cue.label.toLowerCase()}</span>
        {cue.hint && (
          <Tooltip toggleable delay={300}>
            <TooltipTrigger className="info-btn" aria-label={`More about the ${exercise.name.toLowerCase()} cue`}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 7.2V11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
              </svg>
            </TooltipTrigger>
            <TooltipContent className="tooltip" side="bottom" align="end" sideOffset={4} collisionPadding={12}>
              {cue.hint}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <p>{cue.cue || "No cue for this move yet."}</p>
    </div>
  </div>
);

const Ticker = ({ workout, next }: { workout: InProgress; next: { weight: number | null; reps: number } | null }) => {
  const list = useRef<HTMLOListElement>(null);
  const here = workout.logged.length;

  useEffect(() => {
    const ol = list.current;
    const pill = ol?.children[here] as HTMLElement | undefined;
    if (!ol || !pill) return;
    // Keep the current set in view with one upcoming set peeking past it.
    const peek = pill.offsetWidth * 0.5;
    ol.scrollLeft = Math.max(0, pill.offsetLeft - ol.offsetLeft + pill.offsetWidth + peek - ol.clientWidth);
  }, [here]);

  return (
    <ol className="strip" ref={list} aria-label="Sets this session" tabIndex={0}>
      {workout.order.map((slot, i) => {
        const tag = `${cueFor(slot.exerciseId, nameOf(slot.exerciseId)).tag} ${slot.setIndex + 1}`;
        const done = workout.logged[i];
        if (done) {
          return (
            <li className="pill" data-state="done" key={i}>
              {tag} · {kg(done.weight)}×{done.reps} <span aria-hidden="true">&nbsp;✓</span>
              <span className="sr">, done</span>
            </li>
          );
        }
        if (i === here && next) {
          return (
            <li className="pill" data-state="here" key={i} aria-current="step">
              {tag} · {next.weight === null ? "–" : kg(next.weight)}×{next.reps}
            </li>
          );
        }
        return (
          <li className="pill" data-state="upcoming" key={i}>
            {tag}
          </li>
        );
      })}
    </ol>
  );
};

const RoughNight = ({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) => {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-copy">
        <label className="name" htmlFor={id}>
          Rough night
        </label>
        <div className="hint" id={`${id}-hint`}>
          This session won’t count as a stall
        </div>
      </div>
      <Switch id={id} className="switch" checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`}>
        <SwitchThumb className="switch-thumb" />
      </Switch>
    </div>
  );
};

const STATE: Record<TimerView["kind"], string> = { idle: "idle", running: "run", paused: "paused" };

const TimerCards = ({ timers }: { timers: TimersApi }) => (
  <div className="timers">
    <TimerCard name="Rest" total={REST_MS} view={timers.views.rest} act={(a) => timers.act("rest", a)} />
    <TimerCard name="Cooldown" total={COOLDOWN_MS} view={timers.views.cooldown} act={(a) => timers.act("cooldown", a)} />
  </div>
);

const TimerCard = ({
  name,
  total,
  view,
  act,
}: {
  name: string;
  total: number;
  view: TimerView;
  act: (a: TimerAction) => void;
}) => {
  const id = useId();
  const state = view.done ? "done" : STATE[view.kind];
  const status = view.done ? "done" : view.kind === "idle" ? "ready" : view.kind === "paused" ? "paused" : clock(total);
  return (
    <section className="timer" data-state={state} aria-labelledby={id} data-timer={name.toLowerCase()}>
      <div className="timer-kicker kicker">
        <h3 className="kicker" id={id} style={{ margin: 0 }}>
          {name}
        </h3>
        <span>{status}</span>
      </div>
      <div className="time">{clock(view.remainingMs)}</div>
      <div className="sr" role="status">
        {view.done ? `${name} done` : ""}
      </div>
      <div className="timer-actions">
        {view.kind === "running" && !view.done && (
          <>
            <button className="tbtn" type="button" onClick={() => act(pause)}>
              Pause
            </button>
            <button className="tbtn" type="button" onClick={() => act(skip)}>
              Skip
            </button>
          </>
        )}
        {view.kind === "paused" && (
          <>
            <button className="tbtn" type="button" onClick={() => act(resume)}>
              Resume
            </button>
            <button className="tbtn" type="button" onClick={() => act(skip)}>
              Skip
            </button>
          </>
        )}
        {view.kind === "idle" && (
          <button className="tbtn" type="button" onClick={() => act(start)}>
            Start
          </button>
        )}
        {view.done && (
          <>
            <button className="tbtn" type="button" onClick={() => act(start)}>
              Again
            </button>
            <button className="tbtn" type="button" onClick={() => act(skip)}>
              Clear
            </button>
          </>
        )}
      </div>
    </section>
  );
};

const Finished = ({ logged, session, timers }: { logged: LoggedSession; session: SessionApi; timers: TimersApi }) => {
  const sets = logged.exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <>
      <AppBar meta={`session ${logged.letter} · finished`} session={session} />
      <main className="main">
        <div className="pair">
          <h1>Session {logged.letter} saved</h1>
          <div className="sub">
            {sets} sets · {logged.exercises.length} moves{logged.tags.includes("rough-night") ? " · rough night" : ""}
          </div>
        </div>
        <section className="now done-card" aria-labelledby="saved-list">
          <h2 className="kicker" id="saved-list" style={{ margin: 0 }}>
            Logged
          </h2>
          <ul className="saved">
            {logged.exercises.map((e) => (
              <li key={e.exerciseId}>
                <span>{nameOf(e.exerciseId)}</span>
                <span className="last">{e.sets.map((s) => `${kg(s.weight)}×${s.reps}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <button className="log-btn" type="button" onClick={session.startNext}>
            Start next session
          </button>
        </section>
        <TimerCards timers={timers} />
      </main>
    </>
  );
};
