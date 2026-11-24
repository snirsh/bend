/**
 * Rest and cooldown timers as pure state. Every function takes `now` (epoch ms)
 * from the caller, and a running timer stores its absolute end time, so the
 * remaining time is right after a screen lock, a background tab or a reload.
 */

export const REST_MS = 120_000;
export const COOLDOWN_MS = 300_000;
export const TIMERS_KEY = "bend.timers.v1";

export type TimerState =
  | { readonly kind: "idle"; readonly durationMs: number }
  | {
      readonly kind: "running";
      readonly durationMs: number;
      readonly startedAt: number;
      readonly endsAt: number;
      /** The latest clock reading seen while running. A clock that jumps back never gives time back. */
      readonly seenAt: number;
    }
  | { readonly kind: "paused"; readonly durationMs: number; readonly remainingMs: number }
  /** Ended. Stays ended whatever the clock does next, so it ends exactly once. */
  | { readonly kind: "done"; readonly durationMs: number };

export type TimerView = { readonly kind: TimerState["kind"]; readonly remainingMs: number; readonly done: boolean };

export type Timers = { readonly rest: TimerState; readonly cooldown: TimerState };

export const idle = (durationMs: number): TimerState => ({ kind: "idle", durationMs });

const running = (durationMs: number, now: number, remainingMs: number): TimerState => ({
  kind: "running",
  durationMs,
  startedAt: now,
  endsAt: now + remainingMs,
  seenAt: now,
});

/** Starts from the full duration, restarting a timer that is already running or done. */
export const start = (s: TimerState, now: number): TimerState => running(s.durationMs, now, s.durationMs);

const remaining = (s: TimerState, now: number): number => {
  switch (s.kind) {
    case "idle":
      return s.durationMs;
    case "paused":
      return s.remainingMs;
    case "done":
      return 0;
    case "running":
      return Math.min(Math.max(s.endsAt - Math.max(now, s.seenAt), 0), s.endsAt - s.startedAt);
  }
};

/** Records a clock reading: a running timer remembers the latest one, and ends once its time is up. */
export const observe = (s: TimerState, now: number): TimerState => {
  if (s.kind !== "running") return s;
  if (remaining(s, now) === 0) return { kind: "done", durationMs: s.durationMs };
  return now > s.seenAt ? { ...s, seenAt: now } : s;
};

/** Milliseconds until the shown whole second changes, or `null` when the display is still. */
export const msUntilChange = (s: TimerState, now: number): number | null => {
  if (s.kind !== "running") return null;
  const left = remaining(s, now);
  return left === 0 ? null : left % 1000 || 1000;
};

export const view = (s: TimerState, now: number): TimerView => {
  const remainingMs = remaining(s, now);
  return { kind: s.kind, remainingMs, done: s.kind === "done" || (s.kind === "running" && remainingMs === 0) };
};

/** A finished timer stays finished. */
export const pause = (s: TimerState, now: number): TimerState => {
  if (s.kind !== "running") return s;
  const remainingMs = remaining(s, now);
  return remainingMs === 0 ? s : { kind: "paused", durationMs: s.durationMs, remainingMs };
};

export const resume = (s: TimerState, now: number): TimerState =>
  s.kind === "paused" ? running(s.durationMs, now, s.remainingMs) : s;

export const skip = (s: TimerState): TimerState => idle(s.durationMs);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const jsonOrNull = (text: string | null): unknown => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const parseTimer = (raw: unknown, fallbackMs: number): TimerState => {
  if (!isRecord(raw)) return idle(fallbackMs);
  const { kind, durationMs, startedAt, endsAt, remainingMs, seenAt = startedAt } = raw;
  if (!isTime(durationMs) || durationMs <= 0) return idle(fallbackMs);
  switch (kind) {
    case "idle":
    case "done":
      return { kind, durationMs };
    case "running":
      return isTime(startedAt) &&
        isTime(endsAt) &&
        isTime(seenAt) &&
        startedAt <= endsAt &&
        endsAt - startedAt <= durationMs &&
        seenAt >= startedAt
        ? { kind, durationMs, startedAt, endsAt, seenAt }
        : idle(fallbackMs);
    case "paused":
      return isTime(remainingMs) && remainingMs > 0 && remainingMs <= durationMs
        ? { kind, durationMs, remainingMs }
        : idle(fallbackMs);
    default:
      return idle(fallbackMs);
  }
};

/** Reads the stored `JSON.stringify(timers)`; anything missing or corrupt becomes an idle timer. */
export const parseTimers = (text: string | null): Timers => {
  const raw = jsonOrNull(text);
  const stored = isRecord(raw) ? raw : {};
  return { rest: parseTimer(stored.rest, REST_MS), cooldown: parseTimer(stored.cooldown, COOLDOWN_MS) };
};
