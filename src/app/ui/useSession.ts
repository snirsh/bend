import { useCallback, useEffect, useState } from "react";
import { nextSession } from "../../engine/prescribe.ts";
import type { LoggedSession, LoggedSet, Plan } from "../../engine/types.ts";
import { mergeHistory, parseBackup, toBackup } from "../backup.ts";
import { devFixturePlan } from "../dev-fixture.ts";
import { plan as realPlan } from "../../plan/plan.ts";
import { openStore, type Store } from "../storage.ts";
import { today } from "../today.ts";
import { logSet, setRoughNight, startWorkout, toLoggedSession, type InProgress } from "../workout.ts";

/** The real split is still empty, so the dev fixture runs until it exists. */
const realSplitMissing = Object.values(realPlan.days).every((d) => d.blocks.length === 0);
export const usingFixture = realSplitMissing;
export const activePlan: Plan = realSplitMissing ? devFixturePlan : realPlan;

export type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "active"; readonly history: readonly LoggedSession[]; readonly workout: InProgress }
  | { readonly kind: "finished"; readonly history: readonly LoggedSession[]; readonly session: LoggedSession };

const fresh = (history: readonly LoggedSession[]): InProgress =>
  startWorkout(nextSession(history, activePlan, today()), activePlan);

/**
 * Where the app is on load: a saved workout resumes; with none, a session already finished
 * today shows as finished; otherwise the engine prescribes the next one.
 */
const settle = (history: readonly LoggedSession[], saved: InProgress | null): Phase => {
  if (saved && saved.logged.length > 0 && saved.prescription.date === today()) return { kind: "active", history, workout: saved };
  const todays = history.filter((s) => s.date === today());
  const latest = todays.at(-1);
  if (latest) return { kind: "finished", history, session: latest };
  return { kind: "active", history, workout: fresh(history) };
};

export const useSession = () => {
  const [store, setStore] = useState<Store | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const failed = (what: string) => (e: unknown) =>
    setSaveError(`${what} was not saved: ${e instanceof Error ? e.message : String(e)}. Try again before closing the app.`);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await openStore();
      const [stored, saved] = await Promise.all([s.loadHistory(), s.loadInProgress()]);
      // A workout left unfinished on an earlier day is that day's session: save it, then start today fresh.
      const leftover = saved && saved.prescription.date !== today() ? toLoggedSession(saved) : null;
      if (leftover) await s.finishSession(leftover);
      const history = leftover ? await s.loadHistory() : stored;
      if (!live) return;
      setStore(s);
      setPhase(settle(history, saved));
    })().catch((e: unknown) => {
      if (live) setPhase({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      live = false;
    };
  }, []);

  const [saving, setSaving] = useState(false);

  /**
   * Saves the changed workout and shows it only once the IndexedDB transaction has committed.
   * Until then the screen keeps the last saved state, so a reload or a killed app never loses
   * something the screen already showed as done. Resolves true when saved.
   */
  const update = useCallback(
    async (change: (w: InProgress) => InProgress): Promise<boolean> => {
      if (!store || phase.kind !== "active" || saving) return false;
      const workout = change(phase.workout);
      setSaving(true);
      try {
        await store.saveInProgress(workout);
        setSaveError(null);
        setPhase({ ...phase, workout });
        return true;
      } catch (e) {
        failed("Your last change")(e);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [store, phase, saving],
  );

  const log = useCallback((set: LoggedSet) => update((w) => logSet(w, set)), [update]);
  const roughNight = useCallback((on: boolean) => update((w) => setRoughNight(w, on)), [update]);

  /** Saves the session. Returns false when nothing was logged, so there is nothing to save. */
  const finish = useCallback(async (): Promise<boolean> => {
    if (!store || phase.kind !== "active") return false;
    const session = toLoggedSession(phase.workout);
    if (!session) return false;
    try {
      await store.finishSession(session);
      const history = await store.loadHistory();
      setSaveError(null);
      setPhase({ kind: "finished", history, session });
      return true;
    } catch (e) {
      failed("The session")(e);
      return false;
    }
  }, [store, phase]);

  const discard = useCallback(async () => {
    if (!store || phase.kind !== "active") return;
    await store.clearInProgress();
    setPhase({ kind: "active", history: phase.history, workout: fresh(phase.history) });
  }, [store, phase]);

  const startNext = useCallback(() => {
    if (phase.kind !== "finished") return;
    setPhase({ kind: "active", history: phase.history, workout: fresh(phase.history) });
  }, [phase]);

  const exportFile = useCallback((): string | null => {
    if (phase.kind === "loading" || phase.kind === "failed") return null;
    return JSON.stringify(toBackup(phase.history, new Date().toISOString()), null, 2);
  }, [phase]);

  /** Merges a backup into the stored history. Returns a message for the user. */
  const importFile = useCallback(
    async (text: string): Promise<{ ok: boolean; message: string }> => {
      if (!store || (phase.kind !== "active" && phase.kind !== "finished")) return { ok: false, message: "Still loading." };
      const parsed = parseBackup(text, today());
      if (!parsed.ok) return { ok: false, message: parsed.error };
      const { added, duplicates } = mergeHistory(phase.history, parsed.backup.sessions);
      await store.addSessions(added);
      const history = await store.loadHistory();
      const saved = phase.kind === "active" && phase.workout.logged.length > 0 ? phase.workout : null;
      setPhase(settle(history, saved));
      const skipped = duplicates > 0 ? `, ${duplicates} already here` : "";
      return { ok: true, message: `Imported ${added.length} session${added.length === 1 ? "" : "s"}${skipped}.` };
    },
    [store, phase],
  );

  return { phase, saving, saveError, log, roughNight, finish, discard, startNext, exportFile, importFile };
};
