import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walks up from `start` looking for a `.morrel` dir, then a `.git` dir. Falls back to `start`. */
export function findProjectRoot(start: string = process.cwd()): string {
  let dir = resolve(/*turbopackIgnore: true*/ start);
  for (const marker of [".morrel", ".git"]) {
    let d = dir;
    while (true) {
      if (existsSync(join(/*turbopackIgnore: true*/ d, marker))) return d;
      const parent = dirname(d);
      if (parent === d) break;
      d = parent;
    }
  }
  return dir;
}

/** Resolves the DB path: `MORREL_DB` env, else `<root>/.morrel/morrel.db`. */
export function resolveDbPath(start?: string): string {
  if (process.env.MORREL_DB) return resolve(/*turbopackIgnore: true*/ process.env.MORREL_DB);
  return join(/*turbopackIgnore: true*/ findProjectRoot(start), ".morrel", "morrel.db");
}

export function runsDir(dbPath: string): string {
  return join(dirname(dbPath), "runs");
}
