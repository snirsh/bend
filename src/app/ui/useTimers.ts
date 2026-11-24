import { useCallback, useEffect, useRef, useState } from "react";
import { TIMERS_KEY, msUntilChange, observe, parseTimers, view, type TimerState, type TimerView, type Timers } from "../timer.ts";

type TimerName = keyof Timers;
export type TimerAction = (state: TimerState, now: number) => TimerState;

const LABELS: Record<TimerName, string> = { rest: "Rest is over", cooldown: "Cooldown done" };

const readStored = (): Timers => {
  try {
    return parseTimers(localStorage.getItem(TIMERS_KEY));
  } catch {
    return parseTimers(null);
  }
};

const save = (timers: Timers) => {
  try {
    localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
  } catch {
    // Private mode or full storage: the timers still run for this page.
  }
};

/** Shows a notification only when the user already granted permission. Never asks. */
const notify = async (title: string) => {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) await registration.showNotification(title, { tag: "bend-timer", icon: "/icons/icon-192.png" });
  else new Notification(title);
};

/**
 * Rest and cooldown timers. State holds absolute times. Every refresh records the clock with
 * `observe`, so a running timer ends exactly once, and the display wakes at the next whole-second
 * change plus whenever the page is shown again.
 */
export const useTimers = () => {
  const [timers, setTimers] = useState(readStored);
  const latest = useRef(timers);
  const [now, setNow] = useState(Date.now);

  const tick = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshRef = useRef<() => void>(() => {});

  /** Saves, shows, and schedules the next wake-up at the next whole-second change. */
  const commit = useCallback((next: Timers, at: number) => {
    latest.current = next;
    save(next);
    setTimers(next);
    setNow(at);
    clearTimeout(tick.current);
    const waits = [msUntilChange(next.rest, at), msUntilChange(next.cooldown, at)].filter((ms) => ms !== null);
    if (waits.length > 0) tick.current = setTimeout(() => refreshRef.current(), Math.min(...waits));
  }, []);

  const refresh = useCallback(() => {
    const at = Date.now();
    const before = latest.current;
    const next = { rest: observe(before.rest, at), cooldown: observe(before.cooldown, at) };
    for (const name of ["rest", "cooldown"] as const) {
      if (before[name].kind !== "done" && next[name].kind === "done" && document.visibilityState === "hidden") {
        void notify(LABELS[name]);
      }
    }
    commit(next, at);
  }, [commit]);
  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
    const events = ["pageshow", "focus"] as const;
    for (const e of events) window.addEventListener(e, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      for (const e of events) window.removeEventListener(e, refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearTimeout(tick.current);
    };
  }, [refresh]);

  /** Applies an action and saves the result at once, so a lock right after a tap keeps it. */
  const act = useCallback(
    (name: TimerName, action: TimerAction) => {
      const at = Date.now();
      commit({ ...latest.current, [name]: action(latest.current[name], at) }, at);
    },
    [commit],
  );

  const views: Record<TimerName, TimerView> = { rest: view(timers.rest, now), cooldown: view(timers.cooldown, now) };
  return { views, act };
};
