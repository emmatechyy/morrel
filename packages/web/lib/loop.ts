import type { Run } from "@morrel/core";

export interface Recovery {
  /** First real failure of the streak the memory recovered from. */
  failed: Run;
  /** The real pass that closed the loop. */
  passed: Run;
}

/**
 * A memory has "recovered" when its latest real run passed and an earlier real run failed:
 * Kane caught a problem, the app or the memory was fixed, and Kane confirmed it again.
 * `runs` may be in any order.
 */
export function recoveryOf(runs: Run[]): Recovery | null {
  const real = runs.filter((r) => r.runner === "kane" && r.result).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  const last = real[real.length - 1];
  if (!last || last.result !== "pass") return null;
  let i = real.length - 1;
  while (i >= 0 && real[i]!.result === "pass") i--;
  if (i < 0 || real[i]!.result !== "fail") return null;
  let j = i;
  while (j > 0 && real[j - 1]!.result === "fail") j--;
  return { failed: real[j]!, passed: real[i + 1]! };
}
