import "server-only";
import { MorrelStore, resolveDbPath } from "@morrel/core";
import { existsSync } from "node:fs";
import { DemoStore } from "./demo";

export type ReadStore = Pick<MorrelStore, "findMemory" | "getMemory" | "listMemories" | "listGated" | "counts" | "listRuns" | "listEvents">;

/** Public read-only demo: data comes from the bundled demo/demo.json export, no SQLite at runtime. */
export const isDemo = () => process.env.MORREL_DEMO === "1";

export function dbPath(): string {
  return isDemo() ? "read-only demo" : resolveDbPath(process.cwd());
}

let demoStore: DemoStore | null = null;

/** Opens the shared Morrel DB (same file the CLI writes), or the demo dataset. */
export function withStore<T>(fn: (s: ReadStore) => T): T {
  if (isDemo()) {
    demoStore ??= new DemoStore();
    return fn(demoStore as unknown as ReadStore);
  }
  const s = MorrelStore.open(dbPath());
  try {
    return fn(s);
  } finally {
    s.close();
  }
}

export function demoRaw(runId: string): string[] | null {
  if (!isDemo()) return null;
  demoStore ??= new DemoStore();
  return demoStore.raw[runId] ?? null;
}

export function dbExists(): boolean {
  return isDemo() || existsSync(dbPath());
}
