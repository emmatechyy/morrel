/**
 * MOCK runner — for demos and tests only (MORREL_KANE_MOCK=1).
 * Emits a SYNTHETIC stream shaped like Kane CLI's documented `--agent` NDJSON and pushes it
 * through the real parser. Runs are recorded with runner = "mock" and evidence.mock = true,
 * the UI labels them MOCK, and the read gate never trusts them (unless MORREL_TRUST_MOCK=1).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Flow } from "../types.js";
import { parseKaneOutput } from "./parser.js";
import type { KaneRunOutcome } from "./runner.js";

export interface MockRunOptions {
  flow: Flow;
  memoryKey: string;
  rawPath: string;
  /** Force an outcome. Default: pass, unless the key matches MORREL_MOCK_FAIL (comma list, `*` wildcard). */
  outcome?: "pass" | "fail" | "error";
  now?: Date;
}

export function mockOutcomeFor(key: string): "pass" | "fail" {
  const spec = process.env.MORREL_MOCK_FAIL ?? "";
  const patterns = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const hit = patterns.some((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(key));
  return hit ? "fail" : "pass";
}

function splitObjective(objective: string): string[] {
  return objective
    .split(/(?:,\s*then\s+|\bthen\b|;|\.\s+|,\s*and\s+)/i)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 3)
    .slice(0, 8);
}

export function buildMockStream(opts: MockRunOptions): { stdout: string; exitCode: number; stderr: string } {
  const outcome = opts.outcome ?? mockOutcomeFor(opts.memoryKey);
  let t = (opts.now ?? new Date()).getTime() - 25_000;
  const ts = () => new Date((t += 900 + Math.floor(Math.random() * 1400))).toISOString();
  const lines: Record<string, unknown>[] = [];
  const sessionId = `mock-${opts.memoryKey}`;
  lines.push({ type: "stream_start", cli_version: "mock", surface: "run", pid: 0, mock: true, v: 1, ts: ts() });
  if (outcome === "error") {
    lines.push({ type: "error", message: "MOCK: simulated refusal before start (no run_end)", v: 1, ts: ts() });
    return { stdout: lines.map((l) => JSON.stringify(l)).join("\n") + "\n", exitCode: 2, stderr: "MOCK: Not authenticated." };
  }
  const parts = splitObjective(opts.flow.objective ?? `Run test file ${opts.flow.file}`);
  const actions: string[] = [];
  if (opts.flow.url) actions.push(`navigate: Navigate to ${opts.flow.url}`);
  parts.forEach((p, i) => {
    const verb = /verify|assert|check|expect|should|see/i.test(p) ? "assert" : i === 0 && !opts.flow.url ? "navigate" : "act";
    actions.push(`${verb}: ${p}`);
  });
  const failAt = outcome === "fail" ? Math.max(0, actions.length - 1) : -1;
  let step = 1;
  for (let i = 0; i < actions.length; i++) {
    step++;
    lines.push({ step, status: "running", remark: `Step ${i + 1}`, v: 1, ts: ts() });
    if (i === failAt) {
      lines.push({ step, status: "failed", remark: `${actions[i]} — expected condition not met (MOCK)`, v: 1, ts: ts() });
      break;
    }
    lines.push({ step, status: "done", remark: actions[i], v: 1, ts: ts() });
  }
  const passed = outcome === "pass";
  const firstTs = Date.parse(lines[0]!.ts as string);
  const end = {
    type: "run_end",
    status: passed ? "passed" : "failed",
    summary: passed
      ? `MOCK: all ${actions.length} steps completed for "${opts.memoryKey}".`
      : `MOCK: assertion failed at step ${failAt + 1} of ${actions.length}: ${actions[failAt]}`,
    one_liner: passed ? "Objective completed (mock)" : "Assertion failed (mock)",
    reason: passed ? "Objective completed" : "Assertion failed",
    duration: Math.round((t - firstTs) / 100) / 10,
    credits_consumed: 0,
    session_dir: `~/.testmuai/kaneai/sessions/${sessionId}`,
    mock: true,
    v: 1,
    ts: ts(),
  };
  lines.push(end);
  return {
    stdout: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    exitCode: passed ? 0 : 1,
    stderr: "MOCK: no evidence pack is produced by the mock runner.",
  };
}

export function runMock(opts: MockRunOptions): KaneRunOutcome {
  const started = Date.now();
  const { stdout, exitCode, stderr } = buildMockStream(opts);
  mkdirSync(dirname(opts.rawPath), { recursive: true });
  writeFileSync(opts.rawPath, stdout);
  const parsed = parseKaneOutput(stdout, exitCode, stderr, { mock: true });
  parsed.evidence.mock = true;
  return { ...parsed, exitCode, command: `[mock] kane-cli run ${JSON.stringify(opts.flow.objective ?? opts.flow.file)} --agent --headless`, wallMs: Date.now() - started };
}
