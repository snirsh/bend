import type { CalendarDate } from "./types.ts";

const DAY_MS = 86_400_000;
/** `Date.UTC` maps years 0-99 to 1900-1999, and the format caps the year at 9999. */
const MIN_YEAR = 1900;

const epochDay = (s: string): number =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / DAY_MS;

export const calendarDate = (s: string): CalendarDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new RangeError(`Not a YYYY-MM-DD date: "${s}"`);
  if (Number(s.slice(0, 4)) < MIN_YEAR) throw new RangeError(`"${s}" is outside the supported years ${MIN_YEAR}-9999`);
  if (!new Date(epochDay(s) * DAY_MS).toISOString().startsWith(s)) throw new RangeError(`Not a real date: "${s}"`);
  return s as CalendarDate;
};

export const daysBetween = (from: CalendarDate, to: CalendarDate): number => epochDay(to) - epochDay(from);
