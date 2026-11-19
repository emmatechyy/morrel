/**
 * Ordered migrations. `PRAGMA user_version` tracks how many have been applied.
 * Never edit a shipped migration; append a new one.
 */
export const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE memories (
    id               TEXT PRIMARY KEY,
    key              TEXT NOT NULL UNIQUE,
    claim            TEXT NOT NULL,
    flow_objective   TEXT,
    flow_url         TEXT,
    flow_file        TEXT,
    status           TEXT NOT NULL DEFAULT 'unverified'
                     CHECK (status IN ('verified','failed','stale','unverified','retired')),
    status_reason    TEXT,
    tags             TEXT NOT NULL DEFAULT '[]',
    version          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    last_verified_at TEXT,
    git_sha          TEXT,
    last_run_id      TEXT,
    last_runner      TEXT CHECK (last_runner IN ('kane','mock')),
    retired_at       TEXT,
    CHECK (flow_objective IS NOT NULL OR flow_file IS NOT NULL)
  );
  CREATE INDEX idx_memories_status ON memories(status);

  CREATE TABLE runs (
    id               TEXT PRIMARY KEY,
    memory_id        TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    memory_version   INTEGER NOT NULL,
    runner           TEXT NOT NULL CHECK (runner IN ('kane','mock')),
    started_at       TEXT NOT NULL,
    finished_at      TEXT,
    result           TEXT CHECK (result IN ('pass','fail','error')),
    exit_code        INTEGER,
    duration_ms      INTEGER,
    summary          TEXT,
    reason           TEXT,
    git_sha          TEXT,
    command          TEXT,
    evidence         TEXT NOT NULL DEFAULT '{}',
    raw_ndjson_path  TEXT
  );
  CREATE INDEX idx_runs_memory ON runs(memory_id, started_at DESC);
  CREATE INDEX idx_runs_started ON runs(started_at DESC);

  CREATE TABLE memory_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id    TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    version      INTEGER NOT NULL,
    from_status  TEXT,
    to_status    TEXT,
    detail       TEXT NOT NULL DEFAULT '{}',
    git_sha      TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX idx_events_memory ON memory_events(memory_id, id DESC);

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
