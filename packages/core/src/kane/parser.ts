/**
 * Parser for Kane CLI `--agent` NDJSON streams.
 *
 * Contract (Kane CLI docs, "Agent Mode", stream contract v1, checked against kane-cli 0.10.6):
 *  - stdout is NDJSON, one object per line, each with `v` and `ts`.
 *  - First line: {"type":"stream_start","cli_version","surface":"run"|"testmd"|"testrun",...}
 *  - `kane-cli run` step lines are UNTYPED: {"step":n,"status":"running"|"done"|"failed","remark", "child_id"?}
 *  - Typed events: bifurcation, child_agent_start/end, warning, error, ask_user, coverage, ...
 *  - Completion: `run_end` for `run` (status "passed"|"failed"), `test_md_done` for `testmd run`
 *    (overall_status). A run refused before starting may emit no completion event.
 *  - Unknown fields/types must be ignored; non-JSON lines skipped.
 *  - Exit codes: 0 pass, 1 did not pass (or upload failed), 2 did not start, 3 cancelled/timeout.
 *  - Docs: the evidence pack path is only a stderr hint line
 *      evidence: view locally with `kane-cli evidence serve <path>`
 *
 * Observed on real kane-cli 0.10.6 runs (2026-11-19), beyond the docs:
 *  - a `coverage` event (and `run_end.coverage`) carries `pack`: the evidence pack path ON STDOUT.
 *  - `run_end.result_code` is a NUMBER (710), not a string; `per_flow_metadata[].result_code` is a string.
 *  - `run_end.verdict` (Kane's triage: status/family/category/severity/confidence/suggestion) is present
 *    even without --bug-detection; `reason_code` (e.g. "assertion_error.final_verification").
 *  - `run_end.context.memory` holds each checkpoint's expected vs extracted value.
 *  - extra typed events: recording_state, skill_update_available.
 *  - an unauthenticated run exits 1 (docs: 2) with no run_end.
 */
import type { Evidence, EvidenceCheck, EvidenceStep, EvidenceVerdict, RunResult } from "../types.js";

export interface ParsedRun {
  result: RunResult;
  /** True when a completion event (run_end / test_md_done) was seen. */
  completed: boolean;
  summary: string | null;
  reason: string | null;
  /** Duration reported by Kane, in ms (falls back to wall clock in the runner). */
  durationMs: number | null;
  evidence: Evidence;
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Incremental parser: feed lines as they stream in, then call `finish`. */
export class KaneStreamParser {
  private evidence: Evidence = { mock: false, steps: [], screenshots: [], warnings: [], errors: [] };
  private runEnd: Json | null = null;
  private testMdDone: Json | null = null;
  private stepCount = 0;
  readonly events: Json[] = [];

  constructor(opts: { mock?: boolean } = {}) {
    this.evidence.mock = opts.mock ?? false;
  }

  /** Feed one raw stdout line. Returns the parsed object, or null for blank/non-JSON lines. */
  push(line: string): Json | null {
    const t = line.trim();
    if (!t || t[0] !== "{") return null;
    let obj: Json;
    try {
      obj = JSON.parse(t) as Json;
    } catch {
      return null;
    }
    if (typeof obj !== "object" || obj === null) return null;
    this.events.push(obj);
    this.handle(obj);
    return obj;
  }

  private handle(o: Json): void {
    const type = str(o.type);
    const ev = this.evidence;
    if (!type) {
      // Untyped progress line on a `run` stream.
      if (typeof o.step === "number" && (o.status === "done" || o.status === "failed")) {
        const step: EvidenceStep = {
          index: ++this.stepCount,
          status: o.status,
          remark: str(o.remark) ?? "",
        };
        if (str(o.child_id)) step.childId = str(o.child_id);
        if (str(o.ts)) step.ts = str(o.ts);
        ev.steps.push(step);
      }
      return;
    }
    switch (type) {
      case "stream_start":
        ev.cliVersion = str(o.cli_version);
        ev.surface = str(o.surface);
        ev.sessionDir ??= str(o.session_dir);
        break;
      case "coverage":
        if (str(o.pack)) ev.evidencePackPath = str(o.pack);
        break;
      case "warning":
        ev.warnings.push(str(o.message) ?? str(o.code) ?? "warning");
        break;
      case "error":
        ev.errors.push(str(o.message) ?? "error");
        break;
      case "test_md_step_end": {
        // testmd streams: typed step wrappers. Field names beyond status are best-effort.
        const status = str(o.status);
        const failed = status ? /fail|error|broke/i.test(status) : false;
        ev.steps.push({
          index: ++this.stepCount,
          status: failed ? "failed" : "done",
          remark: str(o.remark) ?? str(o.title) ?? str(o.step) ?? str(o.summary) ?? `Step ${this.stepCount}`,
          ts: str(o.ts),
        });
        break;
      }
      case "run_end":
        // In testmd streams run_end closes an individual step; keep the last one either way.
        this.runEnd = o;
        break;
      case "test_md_done":
        this.testMdDone = o;
        break;
      default:
        break; // ignore unknown types
    }
  }

  /** Finalise with the process exit code and captured stderr. */
  finish(exitCode: number | null, stderr = ""): ParsedRun {
    const ev = this.evidence;
    const pack = stderr.match(/kane-cli evidence serve\s+([^`\s]+)`?/);
    if (pack?.[1] && !ev.evidencePackPath) ev.evidencePackPath = pack[1];
    const tail = stderr.trim().split("\n").slice(-12).join("\n").trim();
    if (tail) ev.stderrTail = tail.slice(-2000);

    const done = this.testMdDone;
    const end = this.runEnd;

    if (done) {
      const overall = str(done.overall_status) ?? "";
      ev.shareUrl = str(done.share_url);
      const durS = num(done.duration_s);
      const passed = /^pass/i.test(overall);
      return {
        result: passed ? "pass" : "fail",
        completed: true,
        summary: str(done.summary) ?? `testmd ${overall || "finished"}`,
        reason: overall || null,
        durationMs: durS != null ? Math.round(durS * 1000) : null,
        evidence: ev,
      };
    }

    if (end && ev.surface !== "testmd") {
      ev.oneLiner = str(end.one_liner);
      ev.testUrl = str(end.test_url);
      ev.sessionDir = str(end.session_dir) ?? ev.sessionDir;
      ev.resultCode = str(end.result_code) ?? (num(end.result_code) != null ? String(end.result_code) : undefined);
      ev.creditsConsumed = num(end.credits_consumed) ?? num(end.credits);
      if (end.final_state && typeof end.final_state === "object" && Object.keys(end.final_state).length) ev.finalState = end.final_state as Record<string, unknown>;
      ev.reasonCode = str(end.reason_code);
      ev.details = str(end.summary);
      const checks = parseChecks(end.context);
      if (checks.length) ev.checks = checks;
      const verdict = parseVerdict(end.verdict);
      if (verdict) ev.verdict = verdict;
      const cov = end.coverage as Json | undefined;
      if (cov && str(cov.pack) && !ev.evidencePackPath) ev.evidencePackPath = str(cov.pack);
      const status = str(end.status);
      const dur = num(end.duration);
      if (status === "passed" && exitCode !== 0 && exitCode !== null) {
        ev.warnings.push(`Kane reported "passed" but exited ${exitCode} (per docs: upload to Test Manager may have failed).`);
      }
      // "stuck.*" (e.g. stuck.max_steps, result_code 310) means Kane ran out of budget before reaching a
      // verdict. That says nothing about the app, so it must not fail (or later "recover") a memory.
      const inconclusive = status !== "passed" && /^stuck\./.test(ev.reasonCode ?? "");
      return {
        result: status === "passed" ? "pass" : inconclusive ? "error" : "fail",
        completed: true,
        summary: str(end.one_liner) ?? str(end.summary) ?? null,
        reason: str(end.reason) ?? null,
        durationMs: dur != null ? Math.round(dur * 1000) : null,
        evidence: ev,
      };
    }

    // No completion event: the run never completed. That proves nothing either way → error.
    let reason: string;
    if (exitCode === 3) reason = "Run cancelled or hit --timeout";
    else if (ev.errors.length) reason = ev.errors[ev.errors.length - 1]!;
    else if (tail) reason = firstMeaningfulLine(stderr) ?? `kane-cli exited ${exitCode}`;
    else reason = `kane-cli exited ${exitCode ?? "abnormally"} without a completion event`;
    return { result: "error", completed: false, summary: null, reason, durationMs: null, evidence: ev };
  }
}

function parseChecks(context: unknown): EvidenceCheck[] {
  const mem = (context as Json | undefined)?.memory;
  if (!mem || typeof mem !== "object") return [];
  return Object.entries(mem as Record<string, Json>)
    .filter(([, v]) => v && typeof v === "object")
    .map(([name, v]) => ({
      name,
      condition: str(v.condition) ?? str(v.query),
      expected: v.expected_value == null ? undefined : String(v.expected_value),
      actual: v.extracted_value == null ? undefined : String(v.extracted_value),
      operator: str(v.operator),
      analyzer: str(v.analyzer_type),
      reasoning: str(v.reasoning),
    }));
}

function parseVerdict(v: unknown): EvidenceVerdict | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Json;
  return {
    status: str(o.status),
    confirmed: typeof o.confirmed === "boolean" ? o.confirmed : undefined,
    family: str(o.family),
    category: str(o.category),
    severity: str(o.severity),
    confidence: num(o.confidence),
    title: str(o.bug_title),
    rootCause: str(o.root_cause),
    suggestion: str(o.suggestion),
  };
}

/** Picks the most diagnostic stderr line: an error-ish line if any, else the last non-decorative one. */
function firstMeaningfulLine(s: string): string | undefined {
  const lines = s
    .split("\n")
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter((l) => l.length > 0 && !/^[╭╰│─]/.test(l) && !/update available/i.test(l));
  const errorish = lines.filter((l) => /error|not authenticated|fail|refus|cannot|could not|invalid|missing|not found/i.test(l));
  return errorish[errorish.length - 1] ?? lines[lines.length - 1];
}

/** Convenience: parse a whole captured stdout buffer. */
export function parseKaneOutput(stdout: string, exitCode: number | null, stderr = "", opts: { mock?: boolean } = {}): ParsedRun {
  const p = new KaneStreamParser(opts);
  for (const line of stdout.split(/\r?\n/)) p.push(line);
  return p.finish(exitCode, stderr);
}
