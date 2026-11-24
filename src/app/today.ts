import { calendarDate } from "../engine/dates.ts";
import type { CalendarDate } from "../engine/types.ts";

/** The device's local calendar date. The engine never reads the clock; the app does, here. */
export const today = (now: Date = new Date()): CalendarDate => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return calendarDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
};
