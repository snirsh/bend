import type { LoggedSession, LoggedSet } from "./types.ts";

const MAX_RIR = 10;

export const setProblem = ({ weight, reps, rir }: LoggedSet): string | null => {
  if (!Number.isFinite(weight) || weight <= 0) return `weight must be a finite number > 0 kg, got ${weight}`;
  if (!Number.isInteger(reps) || reps < 0) return `reps must be an integer >= 0, got ${reps}`;
  if (!Number.isInteger(rir) || rir < 0 || rir > MAX_RIR) return `RIR must be an integer 0-${MAX_RIR}, got ${rir}`;
  return null;
};

export const validateHistory = (history: readonly LoggedSession[]): void => {
  for (const { date, exercises } of history) {
    for (const { exerciseId, sets } of exercises) {
      const where = `session ${date}, exercise "${exerciseId}"`;
      if (sets.length === 0) throw new RangeError(`${where}: logged with zero sets`);
      for (const [i, set] of sets.entries()) {
        const problem = setProblem(set);
        if (problem) throw new RangeError(`${where}, set ${i + 1}: ${problem}`);
      }
    }
  }
};
