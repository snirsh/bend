import { MODE } from "./config.ts";
import { daysBetween } from "./dates.ts";
import type { CalendarDate, Mode } from "./types.ts";

type ModeState = { readonly lastDate: CalendarDate | null; readonly bridgeStart: CalendarDate | null };

const step = (state: ModeState, date: CalendarDate): { mode: Mode; state: ModeState } => {
  if (state.lastDate === null) return { mode: "normal", state: { lastDate: date, bridgeStart: null } };
  const gap = daysBetween(state.lastDate, date);
  if (gap < 0) throw new RangeError(`${date} is before the last session on ${state.lastDate}`);
  const bridgeStart = gap >= MODE.bridgeGapDays ? date : state.bridgeStart;
  const inBridge = bridgeStart !== null && daysBetween(bridgeStart, date) < MODE.bridgeLengthDays;
  const mode: Mode = inBridge ? "bridge" : gap >= MODE.deloadGapDays ? "deload" : "normal";
  return { mode, state: { lastDate: date, bridgeStart } };
};

export const classifyModes = (
  dates: readonly CalendarDate[],
  today: CalendarDate,
): { history: readonly Mode[]; today: Mode } => {
  let state: ModeState = { lastDate: null, bridgeStart: null };
  const history: Mode[] = [];
  for (const date of dates) {
    const next = step(state, date);
    history.push(next.mode);
    state = next.state;
  }
  return { history, today: step(state, today).mode };
};
