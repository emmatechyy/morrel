export const MEMORY_STATUSES = ["verified", "failed", "stale", "unverified", "retired"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type RunResult = "pass" | "fail" | "error";
/** Which runner produced a run. `mock` runs are synthetic and never count as real Kane verification. */
export type Runner = "kane" | "mock";

export interface Flow {
  /** Plain-English Kane objective, passed to `kane-cli run "<objective>"`. */
  objective: string | null;
  /** Optional start URL (`--url`). */
  url: string | null;
  /** Optional path to a `*_test.md` file, run with `kane-cli testmd run <file>`. Takes precedence over objective. */
  file: string | null;
}

export interface Memory {
  id: string;
  key: string;
  claim: string;
  flow: Flow;
  status: MemoryStatus;
  statusReason: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  /** Git commit the memory was last verified against. */
  gitSha: string | null;
  lastRunId: string | null;
  lastRunner: Runner | null;
  retiredAt: string | null;
}

export interface EvidenceStep {
  index: number;
  status: "done" | "failed";
  remark: string;
  childId?: string;
  ts?: string;
}

export interface Evidence {
  /** True when produced by the mock runner. Never present as real. */
  mock: boolean;
  cliVersion?: string;
  surface?: string;
  steps: EvidenceStep[];
  oneLiner?: string;
  finalState?: Record<string, unknown>;
  /** Test Manager link (present when Kane's upload succeeded). */
  testUrl?: string;
  /** Hosted share link for testmd runs. */
  shareUrl?: string;
  sessionDir?: string;
  /** Local `.evidence` pack path, scraped from Kane's stderr hint. */
  evidencePackPath?: string;
  screenshots: string[];
  videoUrl?: string;
  reportUrl?: string;
  resultCode?: string;
  creditsConsumed?: number;
  warnings: string[];
  errors: string[];
  stderrTail?: string;
}

export interface Run {
  id: string;
  memoryId: string;
  memoryVersion: number;
  runner: Runner;
  startedAt: string;
  finishedAt: string | null;
  result: RunResult | null;
  exitCode: number | null;
  durationMs: number | null;
  summary: string | null;
  reason: string | null;
  gitSha: string | null;
  command: string | null;
  evidence: Evidence;
  rawNdjsonPath: string | null;
}

export type MemoryEventType =
  | "created"
  | "updated"
  | "retired"
  | "run_passed"
  | "run_failed"
  | "run_error"
  | "marked_stale";

export interface MemoryEvent {
  id: number;
  memoryId: string;
  type: MemoryEventType;
  version: number;
  fromStatus: MemoryStatus | null;
  toStatus: MemoryStatus | null;
  detail: Record<string, unknown>;
  gitSha: string | null;
  createdAt: string;
}

/** What an agent receives when it reads a memory. */
export interface GatedMemory {
  memory: Memory;
  status: MemoryStatus;
  /** True only when the latest run of the current version passed on the real Kane CLI. */
  trusted: boolean;
  warning: string | null;
  lastRun: Run | null;
}
