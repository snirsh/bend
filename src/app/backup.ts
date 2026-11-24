import { calendarDate } from "../engine/dates.ts";
import {
  exerciseId,
  type CalendarDate,
  type LoggedExercise,
  type LoggedSession,
  type LoggedSet,
  type SessionLetter,
  type SessionTag,
} from "../engine/types.ts";
import { setProblem } from "../engine/validate.ts";

export type BackupV1 = {
  readonly app: "bend";
  readonly schemaVersion: 1;
  /** ISO timestamp of the export. */
  readonly exportedAt: string;
  readonly sessions: readonly LoggedSession[];
};

export type ParsedBackup = { readonly ok: true; readonly backup: BackupV1 } | { readonly ok: false; readonly error: string };

export type Merge = {
  /** Existing sessions plus the added ones, in date order. Same-date sessions keep existing ones first. */
  readonly merged: readonly LoggedSession[];
  /** The incoming sessions that were not already stored, in file order. */
  readonly added: readonly LoggedSession[];
  readonly duplicates: number;
};

const LETTERS: readonly SessionLetter[] = ["A", "B", "C"];
const TAGS: readonly SessionTag[] = ["rough-night"];
const SET_FIELDS = ["weight", "reps", "rir"] as const;

export const toBackup = (sessions: readonly LoggedSession[], exportedAt: string): BackupV1 => ({
  app: "bend",
  schemaVersion: 1,
  exportedAt,
  sessions,
});

class BackupError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLetter = (v: unknown): v is SessionLetter => LETTERS.some((l) => l === v);
const isTag = (v: unknown): v is SessionTag => TAGS.some((t) => t === v);

const parseDate = (v: unknown, where: string): CalendarDate => {
  try {
    if (typeof v === "string") return calendarDate(v);
  } catch {
    // Reported below with the session it belongs to.
  }
  throw new BackupError(`${where}: date must be a real YYYY-MM-DD date, got ${JSON.stringify(v)}`);
};

const parseSet = (raw: unknown, where: string): LoggedSet => {
  if (!isRecord(raw)) throw new BackupError(`${where}: expected an object with weight, reps and rir`);
  for (const field of SET_FIELDS) {
    if (typeof raw[field] !== "number") throw new BackupError(`${where}: ${field} must be a number, got ${JSON.stringify(raw[field])}`);
  }
  const set = { weight: Number(raw.weight), reps: Number(raw.reps), rir: Number(raw.rir) };
  const problem = setProblem(set);
  if (problem) throw new BackupError(`${where}: ${problem}`);
  return set;
};

const parseExercise = (raw: unknown, sessionWhere: string, index: number): LoggedExercise => {
  if (!isRecord(raw) || typeof raw.exerciseId !== "string" || raw.exerciseId === "") {
    throw new BackupError(`${sessionWhere}, exercise ${index + 1}: exerciseId must be a non-empty string`);
  }
  const where = `${sessionWhere}, exercise "${raw.exerciseId}"`;
  if (!Array.isArray(raw.sets) || raw.sets.length === 0) throw new BackupError(`${where}: needs at least one set`);
  return { exerciseId: exerciseId(raw.exerciseId), sets: raw.sets.map((s: unknown, i) => parseSet(s, `${where}, set ${i + 1}`)) };
};

const parseSession = (raw: unknown, index: number): LoggedSession => {
  const n = `session ${index + 1}`;
  if (!isRecord(raw)) throw new BackupError(`${n}: expected an object`);
  const date = parseDate(raw.date, n);
  const where = `${n} (${date})`;
  const { letter, tags, exercises } = raw;
  if (!isLetter(letter)) throw new BackupError(`${where}: letter must be one of ${LETTERS.join(", ")}, got ${JSON.stringify(letter)}`);
  if (!Array.isArray(tags) || !tags.every(isTag)) throw new BackupError(`${where}: tags may only contain ${TAGS.join(", ")}`);
  if (!Array.isArray(exercises)) throw new BackupError(`${where}: exercises must be a list`);
  return { date, letter, exercises: exercises.map((e: unknown, i) => parseExercise(e, where, i)), tags };
};

/** Validates a backup file with the same set rules as the engine. One bad session rejects the whole file. */
export const parseBackup = (text: string): ParsedBackup => {
  try {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new BackupError("Not a bend backup: the file is not valid JSON");
    }
    if (!isRecord(raw) || raw.app !== "bend") throw new BackupError('Not a bend backup: expected "app": "bend"');
    if (raw.schemaVersion !== 1) {
      throw new BackupError(`Unsupported backup version ${JSON.stringify(raw.schemaVersion)}; this app reads version 1`);
    }
    if (typeof raw.exportedAt !== "string" || !Array.isArray(raw.sessions)) {
      throw new BackupError("Not a bend backup: expected exportedAt and a sessions list");
    }
    return { ok: true, backup: toBackup(raw.sessions.map(parseSession), raw.exportedAt) };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.message };
    throw e;
  }
};

/** Equal keys mean the same date, letter, exercises, sets and tags, whatever the field order. */
export const sessionKey = (s: LoggedSession): string =>
  JSON.stringify([
    s.date,
    s.letter,
    s.exercises.map((e) => [e.exerciseId, e.sets.map((x) => [x.weight, x.reps, x.rir])]),
    [...s.tags].sort(),
  ]);

/** Import never replaces: it appends every incoming session that is not an exact duplicate. */
export const mergeHistory = (existing: readonly LoggedSession[], incoming: readonly LoggedSession[]): Merge => {
  const seen = new Set(existing.map(sessionKey));
  const added: LoggedSession[] = [];
  for (const session of incoming) {
    const key = sessionKey(session);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(session);
  }
  const merged = [...existing, ...added].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { merged, added, duplicates: incoming.length - added.length };
};
