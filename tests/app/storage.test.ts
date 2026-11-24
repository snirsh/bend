import { describe, expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { nextSession } from "../../src/engine/index.ts";
import type { LoggedSession } from "../../src/engine/types.ts";
import { openStore } from "../../src/app/storage.ts";
import { logSet, startWorkout, toLoggedSession } from "../../src/app/workout.ts";
import { day, ex, same, session } from "../fixtures/history.ts";
import { fixturePlan, ids } from "../fixtures/plan.ts";

const a0 = session(day(0), "A", [ex(ids.bench, same(3, 60, 8, 2))]);
const b2 = session(day(2), "B", [ex(ids.squat, same(3, 80, 8, 2))], ["rough-night"]);
const c4 = session(day(4), "C", [ex(ids.curl, same(2, 30, 12, 1))]);

const workout = () => startWorkout(nextSession([], fixturePlan, day(6)), fixturePlan);

describe("storage", () => {
  test("a new store has no history and no workout in progress", async () => {
    const store = await openStore(new IDBFactory());
    expect(await store.loadHistory()).toEqual([]);
    expect(await store.loadInProgress()).toBeNull();
  });

  test("sessions load back in the order they were added, after reopening", async () => {
    const idb = new IDBFactory();
    const first = await openStore(idb);
    await first.addSessions([a0]);
    await first.addSessions([c4, b2]);
    const reopened = await openStore(idb);
    expect(await reopened.loadHistory()).toEqual([a0, c4, b2]);
  });

  test("the workout in progress is saved, replaced and cleared", async () => {
    const idb = new IDBFactory();
    const store = await openStore(idb);
    const started = workout();
    await store.saveInProgress(started);
    expect(await (await openStore(idb)).loadInProgress()).toEqual(started);

    const oneSet = logSet(started, { weight: 60, reps: 8, rir: 2 });
    await store.saveInProgress(oneSet);
    expect(await store.loadInProgress()).toEqual(oneSet);

    await store.clearInProgress();
    expect(await store.loadInProgress()).toBeNull();
  });

  test("finishing adds the session and clears the workout in progress together", async () => {
    const idb = new IDBFactory();
    const store = await openStore(idb);
    await store.addSessions([a0]);
    const done = logSet(workout(), { weight: 60, reps: 8, rir: 2 });
    await store.saveInProgress(done);
    const finished = toLoggedSession(done)!;

    await store.finishSession(finished);
    const reopened = await openStore(idb);
    expect(await reopened.loadHistory()).toEqual([a0, finished]);
    expect(await reopened.loadInProgress()).toBeNull();
  });

  test("finishing the same session twice stores it once", async () => {
    const store = await openStore(new IDBFactory());
    await store.saveInProgress(workout());
    await store.finishSession(c4);
    await store.finishSession(c4);
    expect(await store.loadHistory()).toEqual([c4]);
  });

  test("when the session cannot be stored, the workout in progress is kept", async () => {
    const store = await openStore(new IDBFactory());
    const started = workout();
    await store.saveInProgress(started);
    const unstorable = { ...c4, tags: [() => "not cloneable"] } as unknown as LoggedSession;

    await expect(store.finishSession(unstorable)).rejects.toThrow();
    expect(await store.loadHistory()).toEqual([]);
    expect(await store.loadInProgress()).toEqual(started);
  });
});
