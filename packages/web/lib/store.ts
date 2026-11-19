import "server-only";
import { MorrelStore, resolveDbPath } from "@morrel/core";
import { existsSync } from "node:fs";

export function dbPath(): string {
  return resolveDbPath(process.cwd());
}

/** Opens the shared Morrel DB (same file the CLI writes). Short-lived per request. */
export function withStore<T>(fn: (s: MorrelStore) => T): T {
  const s = MorrelStore.open(dbPath());
  try {
    return fn(s);
  } finally {
    s.close();
  }
}

export function dbExists(): boolean {
  return existsSync(dbPath());
}
