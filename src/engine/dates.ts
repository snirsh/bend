import type { CalendarDate } from "./types.ts";

const DAY_MS = 86_400_000;

const epochDay = (s: string): number =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / DAY_MS;

const isCalendarDate = (s: string): s is CalendarDate =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(epochDay(s) * DAY_MS).toISOString().startsWith(s);

export const calendarDate = (s: string): CalendarDate => {
  if (!isCalendarDate(s)) throw new RangeError(`Not a real YYYY-MM-DD date: "${s}"`);
  return s;
};

export const daysBetween = (from: CalendarDate, to: CalendarDate): number => epochDay(to) - epochDay(from);
