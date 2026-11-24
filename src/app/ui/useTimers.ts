import { useCallback, useEffect, useRef, useState } from "react";
import { TIMERS_KEY, parseTimers, view, type TimerState, type TimerView, type Timers } from "../timer.ts";

type TimerName = keyof Timers;
export type TimerAction = (state: TimerState, now: number) => TimerState;

const TICK_MS = 250;
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
 * Rest and cooldown timers. State holds absolute times, so the shown time is recomputed
 * from Date.now() on every tick and whenever the page becomes visible again.
 */
export const useTimers = () => {
  const [timers, setTimers] = useState(readStored);
  const latest = useRef(timers);
  const [now, setNow] = useState(Date.now);
  const wasDone = useRef<Record<TimerName, boolean>>({ rest: false, cooldown: false });

  const views: Record<TimerName, TimerView> = { rest: view(timers.rest, now), cooldown: view(timers.cooldown, now) };
  const ticking = timers.rest.kind === "running" || timers.cooldown.kind === "running";

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const events = ["pageshow", "focus"] as const;
    for (const e of events) window.addEventListener(e, refresh);
    document.addEventListener("visibilitychange", refresh);
    const id = ticking ? setInterval(refresh, TICK_MS) : undefined;
    return () => {
      for (const e of events) window.removeEventListener(e, refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(id);
    };
  }, [ticking]);

  useEffect(() => {
    for (const name of ["rest", "cooldown"] as const) {
      const done = views[name].done;
      if (done && !wasDone.current[name] && document.visibilityState === "hidden") void notify(LABELS[name]);
      wasDone.current[name] = done;
    }
  });

  /** Applies an action and saves the result at once, so a lock right after a tap keeps it. */
  const act = useCallback((name: TimerName, action: TimerAction) => {
    const at = Date.now();
    const next = { ...latest.current, [name]: action(latest.current[name], at) };
    latest.current = next;
    save(next);
    setNow(at);
    setTimers(next);
  }, []);

  return { views, act };
};
