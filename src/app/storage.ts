import type { LoggedSession } from "../engine/types.ts";
import { sessionKey } from "./backup.ts";
import type { InProgress } from "./workout.ts";

const DB_NAME = "bend";
const SESSIONS = "sessions";
const STATE = "state";
const IN_PROGRESS = "inProgress";

export type Store = {
  /** Every stored session, in the order it was added. */
  loadHistory(): Promise<LoggedSession[]>;
  addSessions(sessions: readonly LoggedSession[]): Promise<void>;
  loadInProgress(): Promise<InProgress | null>;
  saveInProgress(workout: InProgress): Promise<void>;
  clearInProgress(): Promise<void>;
  /** Adds the session and clears the workout in progress in one transaction. An identical stored session is not added twice. */
  finishSession(session: LoggedSession): Promise<void>;
};

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const committed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

/** Runs `work` in one transaction and resolves with its result once the transaction commits. */
const transact = async <T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> => {
  const tx = db.transaction(stores, mode);
  const finished = committed(tx);
  try {
    const result = await work(tx);
    await finished;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted.
    }
    await finished.catch(() => undefined);
    throw e;
  }
};

export const openStore = async (idb: IDBFactory = globalThis.indexedDB): Promise<Store> => {
  const request = idb.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(SESSIONS, { autoIncrement: true });
    request.result.createObjectStore(STATE);
  };
  const db = await done(request);

  const loadHistory = () =>
    transact(db, [SESSIONS], "readonly", (tx) => done(tx.objectStore(SESSIONS).getAll() as IDBRequest<LoggedSession[]>));

  return {
    loadHistory,
    addSessions: (sessions) =>
      transact(db, [SESSIONS], "readwrite", (tx) => {
        const store = tx.objectStore(SESSIONS);
        for (const s of sessions) store.add(s);
      }),
    loadInProgress: () =>
      transact(db, [STATE], "readonly", async (tx) => {
        const value = await done(tx.objectStore(STATE).get(IN_PROGRESS) as IDBRequest<InProgress | undefined>);
        return value ?? null;
      }),
    saveInProgress: (workout) =>
      transact(db, [STATE], "readwrite", (tx) => {
        tx.objectStore(STATE).put(workout, IN_PROGRESS);
      }),
    clearInProgress: () =>
      transact(db, [STATE], "readwrite", (tx) => {
        tx.objectStore(STATE).delete(IN_PROGRESS);
      }),
    finishSession: (session) =>
      transact(db, [SESSIONS, STATE], "readwrite", async (tx) => {
        const sessions = tx.objectStore(SESSIONS);
        const stored = await done(sessions.getAll() as IDBRequest<LoggedSession[]>);
        const key = sessionKey(session);
        if (!stored.some((s) => sessionKey(s) === key)) await done(sessions.add(session));
        await done(tx.objectStore(STATE).delete(IN_PROGRESS));
      }),
  };
};
