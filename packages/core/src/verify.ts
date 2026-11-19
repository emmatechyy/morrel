import { join } from "node:path";
import { dirname } from "node:path";
import { currentGitSha } from "./git.js";
import { runMock } from "./kane/mock.js";
import { runKane, scrub, type KaneRunOutcome } from "./kane/runner.js";
import { attachEvidencePack } from "./kane/evidence-pack.js";
import { MorrelStore, newId } from "./store.js";
import type { Memory, Run } from "./types.js";

export interface VerifyOptions {
  /** Directory kane-cli runs in (project root). */
  cwd: string;
  /** Directory for raw NDJSON files. */
  runsDir: string;
  mock?: boolean;
  timeoutSec?: number;
  maxSteps?: number;
  headless?: boolean;
  gitSha?: string | null;
  onEvent?: (memory: Memory, e: Record<string, unknown>) => void;
}

export interface VerifyResult {
  memory: Memory;
  run: Run;
}

export const isMockEnv = () => process.env.MORREL_KANE_MOCK === "1";

/** Runs a memory's Kane flow and records the result. */
export async function verifyMemory(store: MorrelStore, idOrKey: string, opts: VerifyOptions): Promise<VerifyResult> {
  const memory = store.requireMemory(idOrKey);
  if (memory.status === "retired") throw new Error(`memory "${memory.key}" is retired`);
  const runId = newId("run");
  const rawPath = join(opts.runsDir, `${runId}.ndjson`);
  const startedAt = new Date().toISOString();
  const mock = opts.mock ?? isMockEnv();
  const sha = opts.gitSha !== undefined ? opts.gitSha : currentGitSha(opts.cwd);

  let out: KaneRunOutcome;
  if (mock) {
    out = runMock({ flow: memory.flow, memoryKey: memory.key, rawPath });
  } else {
    out = await runKane({
      flow: memory.flow,
      cwd: opts.cwd,
      rawPath,
      timeoutSec: opts.timeoutSec,
      maxSteps: opts.maxSteps,
      headless: opts.headless,
      onEvent: (e) => opts.onEvent?.(memory, e),
    });
  }
  const finishedAt = new Date().toISOString();
  if (!mock) attachEvidencePack(out.evidence, join(opts.runsDir, runId), runId);
  const evidence = JSON.parse(scrub(JSON.stringify(out.evidence))) as typeof out.evidence;
  return store.recordRun({
    id: runId,
    memoryId: memory.id,
    memoryVersion: memory.version,
    runner: mock ? "mock" : "kane",
    startedAt,
    finishedAt,
    result: out.result,
    exitCode: out.exitCode,
    durationMs: out.durationMs ?? out.wallMs,
    summary: out.summary && scrub(out.summary),
    reason: out.reason && scrub(out.reason),
    gitSha: sha,
    command: out.command,
    evidence,
    rawNdjsonPath: rawPath,
  });
}

/** Marks memories stale for the current commit, then re-verifies every non-retired memory sequentially. */
export async function verifyAll(store: MorrelStore, opts: VerifyOptions & { onResult?: (r: VerifyResult) => void }): Promise<{ staled: Memory[]; results: VerifyResult[] }> {
  const sha = opts.gitSha !== undefined ? opts.gitSha : currentGitSha(opts.cwd);
  const staled = store.markStaleForSha(sha);
  const results: VerifyResult[] = [];
  for (const m of store.listMemories()) {
    const r = await verifyMemory(store, m.id, { ...opts, gitSha: sha });
    results.push(r);
    opts.onResult?.(r);
  }
  return { staled, results };
}

export function defaultRunsDir(dbPath: string): string {
  return join(dirname(dbPath), "runs");
}
