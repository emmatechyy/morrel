import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS } from "./schema.js";

export type Db = DatabaseSync;

/**
 * Opens (and migrates) the Morrel SQLite database.
 * Uses Node's built-in `node:sqlite` (Node >= 22.13) — no native build step.
 */
export function openDb(path: string, opts: { readOnly?: boolean } = {}): Db {
  if (path !== ":memory:" && !opts.readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
  db.exec("PRAGMA busy_timeout = 5000;");
  if (!opts.readOnly) {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(db);
  }
  return db;
}

export function migrate(db: Db): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
      version = i + 1;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return version;
}
