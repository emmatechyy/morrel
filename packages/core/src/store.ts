import { randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { openDb } from "./db.js";
import type {
  Evidence,
  Flow,
  GatedMemory,
  Memory,
  MemoryEvent,
  MemoryEventType,
  MemoryStatus,
  Run,
  RunResult,
  Runner,
} from "./types.js";

export class MorrelError extends Error {
  constructor(message: string, public code: "not_found" | "invalid" | "conflict") {
    super(message);
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "memory";
}

const now = () => new Date().toISOString();

type Row = Record<string, unknown>;

function rowToMemory(r: Row): Memory {
  return {
    id: r.id as string,
    key: r.key as string,
    claim: r.claim as string,
    flow: {
      objective: (r.flow_objective as string | null) ?? null,
      url: (r.flow_url as string | null) ?? null,
      file: (r.flow_file as string | null) ?? null,
    },
    status: r.status as MemoryStatus,
    statusReason: (r.status_reason as string | null) ?? null,
    tags: JSON.parse((r.tags as string) || "[]") as string[],
    version: Number(r.version),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    lastVerifiedAt: (r.last_verified_at as string | null) ?? null,
    gitSha: (r.git_sha as string | null) ?? null,
    lastRunId: (r.last_run_id as string | null) ?? null,
    lastRunner: (r.last_runner as Runner | null) ?? null,
    retiredAt: (r.retired_at as string | null) ?? null,
  };
}

const EMPTY_EVIDENCE: Evidence = { mock: false, steps: [], screenshots: [], warnings: [], errors: [] };

function rowToRun(r: Row): Run {
  return {
    id: r.id as string,
    memoryId: r.memory_id as string,
    memoryVersion: Number(r.memory_version),
    runner: r.runner as Runner,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string | null) ?? null,
    result: (r.result as RunResult | null) ?? null,
    exitCode: r.exit_code == null ? null : Number(r.exit_code),
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    summary: (r.summary as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    gitSha: (r.git_sha as string | null) ?? null,
    command: (r.command as string | null) ?? null,
    evidence: { ...EMPTY_EVIDENCE, ...(JSON.parse((r.evidence as string) || "{}") as Partial<Evidence>) },
    rawNdjsonPath: (r.raw_ndjson_path as string | null) ?? null,
  };
}

function rowToEvent(r: Row): MemoryEvent {
  return {
    id: Number(r.id),
    memoryId: r.memory_id as string,
    type: r.type as MemoryEventType,
    version: Number(r.version),
    fromStatus: (r.from_status as MemoryStatus | null) ?? null,
    toStatus: (r.to_status as MemoryStatus | null) ?? null,
    detail: JSON.parse((r.detail as string) || "{}") as Record<string, unknown>,
    gitSha: (r.git_sha as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export interface CreateMemoryInput {
  claim: string;
  flow: Partial<Flow>;
  key?: string;
  tags?: string[];
  gitSha?: string | null;
}

export interface UpdateMemoryInput {
  claim?: string;
  flow?: Partial<Flow>;
  tags?: string[];
  gitSha?: string | null;
}

export interface RecordRunInput {
  memoryId: string;
  runner: Runner;
  startedAt: string;
  finishedAt: string;
  result: RunResult;
  exitCode: number | null;
  durationMs: number;
  summary: string | null;
  reason: string | null;
  gitSha: string | null;
  command: string | null;
  evidence: Evidence;
  rawNdjsonPath: string | null;
  /** Pre-allocated id (so the raw NDJSON file can be named before the run is recorded). */
  id?: string;
  /** Memory version the run was executed against. Defaults to the current version. */
  memoryVersion?: number;
}

export interface ListFilter {
  status?: MemoryStatus | MemoryStatus[];
  search?: string;
  includeRetired?: boolean;
}

export interface StoreOptions {
  /** Treat passing mock runs as trusted. Off by default; for local demos only. */
  trustMock?: boolean;
}

/** Typed repository over the Morrel SQLite database. */
export class MorrelStore {
  readonly trustMock: boolean;

  constructor(public readonly db: Db, opts: StoreOptions = {}) {
    this.trustMock = opts.trustMock ?? process.env.MORREL_TRUST_MOCK === "1";
  }

  static open(path: string, opts: StoreOptions & { readOnly?: boolean } = {}): MorrelStore {
    return new MorrelStore(openDb(path, { readOnly: opts.readOnly }), opts);
  }

  close(): void {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private event(
    memoryId: string,
    type: MemoryEventType,
    version: number,
    fromStatus: MemoryStatus | null,
    toStatus: MemoryStatus | null,
    detail: Record<string, unknown>,
    gitSha: string | null,
    at = now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO memory_events (memory_id, type, version, from_status, to_status, detail, git_sha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(memoryId, type, version, fromStatus, toStatus, JSON.stringify(detail), gitSha, at);
  }

  createMemory(input: CreateMemoryInput): Memory {
    const claim = input.claim?.trim();
    if (!claim) throw new MorrelError("claim is required", "invalid");
    const flow = normalizeFlow(input.flow);
    if (!flow.objective && !flow.file) throw new MorrelError("a Kane flow is required (objective or file)", "invalid");
    const key = slugify(input.key ?? claim);
    if (this.findRow(key)) throw new MorrelError(`memory "${key}" already exists`, "conflict");
    const id = newId("mem");
    const at = now();
    return this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO memories (id, key, claim, flow_objective, flow_url, flow_file, status, status_reason, tags, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'unverified', 'Never verified', ?, 1, ?, ?)`,
        )
        .run(id, key, claim, flow.objective, flow.url, flow.file, JSON.stringify(input.tags ?? []), at, at);
      this.event(id, "created", 1, null, "unverified", { claim, flow }, input.gitSha ?? null, at);
      return this.requireMemory(id);
    });
  }

  private findRow(idOrKey: string): Row | undefined {
    return this.db.prepare("SELECT * FROM memories WHERE id = ? OR key = ?").get(idOrKey, idOrKey) as Row | undefined;
  }

  findMemory(idOrKey: string): Memory | null {
    const r = this.findRow(idOrKey);
    return r ? rowToMemory(r) : null;
  }

  requireMemory(idOrKey: string): Memory {
    const m = this.findMemory(idOrKey);
    if (!m) throw new MorrelError(`memory "${idOrKey}" not found`, "not_found");
    return m;
  }

  /** The agent read gate: returns the memory with its trust verdict. */
  getMemory(idOrKey: string): GatedMemory {
    const memory = this.requireMemory(idOrKey);
    const lastRun = memory.lastRunId ? this.getRun(memory.lastRunId) : null;
    return gate(memory, lastRun, this.trustMock);
  }

  listMemories(filter: ListFilter = {}): Memory[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.status) {
      const s = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status IN (${s.map(() => "?").join(",")})`);
      params.push(...s);
    } else if (!filter.includeRetired) {
      where.push("status != 'retired'");
    }
    if (filter.search) {
      where.push("(key LIKE ? OR claim LIKE ? OR flow_objective LIKE ?)");
      const q = `%${filter.search}%`;
      params.push(q, q, q);
    }
    const sql = `SELECT * FROM memories ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'stale' THEN 1 WHEN 'unverified' THEN 2 WHEN 'verified' THEN 3 ELSE 4 END,
      updated_at DESC`;
    return (this.db.prepare(sql).all(...params) as Row[]).map(rowToMemory);
  }

  listGated(filter: ListFilter = {}): GatedMemory[] {
    return this.listMemories(filter).map((m) => gate(m, m.lastRunId ? this.getRun(m.lastRunId) : null, this.trustMock));
  }

  counts(): Record<MemoryStatus, number> & { total: number } {
    const out = { verified: 0, failed: 0, stale: 0, unverified: 0, retired: 0, total: 0 };
    for (const r of this.db.prepare("SELECT status, COUNT(*) AS n FROM memories GROUP BY status").all() as Row[]) {
      out[r.status as MemoryStatus] = Number(r.n);
      if (r.status !== "retired") out.total += Number(r.n);
    }
    return out;
  }

  /**
   * Rewrites a memory's claim and/or flow. Bumps the version and marks it stale:
   * the new version is untrusted until a Kane run passes against it.
   */
  updateMemory(idOrKey: string, input: UpdateMemoryInput): Memory {
    const m = this.requireMemory(idOrKey);
    if (m.status === "retired") throw new MorrelError(`memory "${m.key}" is retired`, "invalid");
    const claim = input.claim?.trim() || m.claim;
    const flow = input.flow ? normalizeFlow({ ...m.flow, ...input.flow }) : m.flow;
    if (!flow.objective && !flow.file) throw new MorrelError("a Kane flow is required (objective or file)", "invalid");
    const tags = input.tags ?? m.tags;
    const changed: string[] = [];
    if (claim !== m.claim) changed.push("claim");
    if (JSON.stringify(flow) !== JSON.stringify(m.flow)) changed.push("flow");
    if (JSON.stringify(tags) !== JSON.stringify(m.tags)) changed.push("tags");
    if (changed.length === 0) return m;
    const behaviourChanged = changed.includes("claim") || changed.includes("flow");
    const version = behaviourChanged ? m.version + 1 : m.version;
    const status: MemoryStatus = behaviourChanged ? "stale" : m.status;
    const reason = behaviourChanged ? `${changed.filter((c) => c !== "tags").join(" + ")} changed in v${version}; awaiting re-verification` : m.statusReason;
    const at = now();
    return this.tx(() => {
      this.db
        .prepare(
          `UPDATE memories SET claim = ?, flow_objective = ?, flow_url = ?, flow_file = ?, tags = ?, version = ?, status = ?, status_reason = ?, updated_at = ? WHERE id = ?`,
        )
        .run(claim, flow.objective, flow.url, flow.file, JSON.stringify(tags), version, status, reason, at, m.id);
      this.event(m.id, "updated", version, m.status, status, { changed, claim, flow, previous: { claim: m.claim, flow: m.flow } }, input.gitSha ?? null, at);
      return this.requireMemory(m.id);
    });
  }

  retireMemory(idOrKey: string, reason?: string, gitSha: string | null = null): Memory {
    const m = this.requireMemory(idOrKey);
    if (m.status === "retired") return m;
    const at = now();
    return this.tx(() => {
      this.db
        .prepare(`UPDATE memories SET status = 'retired', status_reason = ?, retired_at = ?, updated_at = ? WHERE id = ?`)
        .run(reason ?? "Retired", at, at, m.id);
      this.event(m.id, "retired", m.version, m.status, "retired", { reason: reason ?? null }, gitSha, at);
      return this.requireMemory(m.id);
    });
  }

  /**
   * Marks every verified memory whose verification predates `sha` as stale.
   * Called before `verify --all` and from the git hook.
   */
  markStaleForSha(sha: string | null): Memory[] {
    if (!sha) return [];
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE status = 'verified' AND (git_sha IS NULL OR git_sha != ?)`)
      .all(sha) as Row[];
    const at = now();
    return this.tx(() => {
      const out: Memory[] = [];
      for (const r of rows) {
        const m = rowToMemory(r);
        const reason = `Code changed since last verification (${short(m.gitSha)} → ${short(sha)})`;
        this.db.prepare(`UPDATE memories SET status = 'stale', status_reason = ?, updated_at = ? WHERE id = ?`).run(reason, at, m.id);
        this.event(m.id, "marked_stale", m.version, "verified", "stale", { reason, fromSha: m.gitSha, toSha: sha }, sha, at);
        out.push({ ...m, status: "stale", statusReason: reason });
      }
      this.setMeta("last_seen_sha", sha);
      return out;
    });
  }

  /** Records a finished run and moves the memory to its new status. */
  recordRun(input: RecordRunInput): { run: Run; memory: Memory } {
    const m = this.requireMemory(input.memoryId);
    const id = input.id ?? newId("run");
    const version = input.memoryVersion ?? m.version;
    return this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO runs (id, memory_id, memory_version, runner, started_at, finished_at, result, exit_code, duration_ms, summary, reason, git_sha, command, evidence, raw_ndjson_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id, m.id, version, input.runner, input.startedAt, input.finishedAt, input.result, input.exitCode,
          input.durationMs, input.summary, input.reason, input.gitSha, input.command,
          JSON.stringify(input.evidence), input.rawNdjsonPath,
        );

      // A run against an older version (memory edited mid-run) is kept as history but does not move status.
      if (m.status !== "retired" && version === m.version) {
        let status: MemoryStatus;
        let reason: string;
        const mockNote = input.runner === "mock" ? " (mock runner)" : "";
        if (input.result === "pass") {
          status = "verified";
          reason = `Kane flow passed${mockNote}`;
        } else if (input.result === "fail") {
          status = "failed";
          reason = `Kane flow failed${mockNote}: ${input.summary ?? input.reason ?? "see evidence"}`;
        } else {
          // Run could not execute: we can no longer vouch for the memory.
          status = m.status === "failed" ? "failed" : m.status === "unverified" ? "unverified" : "stale";
          reason = `Verification could not run${mockNote}: ${input.reason ?? "error"}`;
        }
        const verifiedAt = input.result === "pass" ? input.finishedAt : m.lastVerifiedAt;
        const sha = input.result === "pass" ? input.gitSha : m.gitSha;
        this.db
          .prepare(
            `UPDATE memories SET status = ?, status_reason = ?, last_verified_at = ?, git_sha = ?, last_run_id = ?, last_runner = ?, updated_at = ? WHERE id = ?`,
          )
          .run(status, reason, verifiedAt, sha, id, input.runner, input.finishedAt, m.id);
        const type: MemoryEventType = input.result === "pass" ? "run_passed" : input.result === "fail" ? "run_failed" : "run_error";
        this.event(m.id, type, version, m.status, status, { runId: id, runner: input.runner, summary: input.summary }, input.gitSha, input.finishedAt);
      }
      return { run: this.getRun(id)!, memory: this.requireMemory(m.id) };
    });
  }

  getRun(id: string): Run | null {
    const r = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Row | undefined;
    return r ? rowToRun(r) : null;
  }

  listRuns(opts: { memoryId?: string; limit?: number } = {}): Run[] {
    const limit = opts.limit ?? 200;
    const rows = opts.memoryId
      ? this.db.prepare("SELECT * FROM runs WHERE memory_id = ? ORDER BY started_at DESC LIMIT ?").all(opts.memoryId, limit)
      : this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit);
    return (rows as Row[]).map(rowToRun);
  }

  listEvents(memoryId: string): MemoryEvent[] {
    return (this.db.prepare("SELECT * FROM memory_events WHERE memory_id = ? ORDER BY id DESC").all(memoryId) as Row[]).map(rowToEvent);
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as Row | undefined;
    return (r?.value as string) ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}

function normalizeFlow(f: Partial<Flow>): Flow {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return { objective: clean(f.objective), url: clean(f.url), file: clean(f.file) };
}

function short(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "none";
}

const WARNINGS: Record<MemoryStatus, string> = {
  verified: "",
  failed: "UNTRUSTED: the linked Kane flow failed. Do not rely on this memory; update or retire it.",
  stale: "UNTRUSTED: this memory has not been verified against the current code or claim. Re-run `morrel verify`.",
  unverified: "UNTRUSTED: this memory has never been verified by a Kane run.",
  retired: "RETIRED: this memory was retired and must not be used.",
};

/** Pure trust decision. Trusted only when the current version's latest run passed on real Kane CLI. */
export function gate(memory: Memory, lastRun: Run | null, trustMock = false): GatedMemory {
  let trusted = memory.status === "verified";
  let warning: string | null = WARNINGS[memory.status] || null;
  if (trusted && memory.lastRunner === "mock" && !trustMock) {
    trusted = false;
    warning = "UNTRUSTED: last pass came from the mock runner (MORREL_KANE_MOCK), not a real Kane CLI run.";
  }
  if (memory.statusReason && warning) warning = `${warning} Reason: ${memory.statusReason}`;
  return { memory, status: memory.status, trusted, warning, lastRun };
}
