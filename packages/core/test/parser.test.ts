import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KaneStreamParser, parseKaneOutput } from "../src/kane/parser.js";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("Kane NDJSON parser", () => {
  it("maps a passing run_end to pass with steps and evidence links (synthetic)", () => {
    const r = parseKaneOutput(fx("synthetic-pass.ndjson"), 0, "evidence: view locally with `kane-cli evidence serve /tmp/s/evidence/run.evidence`\n");
    expect(r.result).toBe("pass");
    expect(r.completed).toBe(true);
    expect(r.durationMs).toBe(20500);
    expect(r.reason).toBe("Objective completed");
    expect(r.evidence.cliVersion).toBe("0.10.6");
    expect(r.evidence.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(r.evidence.steps[0]!.index).toBe(1); // counted, not Kane's raw step index (which starts at 2 after bifurcation)
    expect(r.evidence.steps[2]!.remark).toMatch(/^assert:/);
    expect(r.evidence.testUrl).toContain("test-manager.lambdatest.com");
    expect(r.evidence.finalState).toEqual({ heading: "Example Domain" });
    expect(r.evidence.creditsConsumed).toBe(11.9);
    expect(r.evidence.evidencePackPath).toBe("/tmp/s/evidence/run.evidence");
    expect(r.evidence.mock).toBe(false);
  });

  it("maps a failing run to fail and keeps the failing step remark (synthetic)", () => {
    const r = parseKaneOutput(fx("synthetic-fail.ndjson"), 1);
    expect(r.result).toBe("fail");
    expect(r.reason).toBe("Assertion failed");
    expect(r.evidence.resultCode).toBe("710");
    expect(r.evidence.warnings[0]).toMatch(/variable/);
    const failed = r.evidence.steps.filter((s) => s.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.remark).toMatch(/Invalid credentials/);
  });

  it("treats the real unauthenticated stream (no run_end, exit 1) as error, not fail", () => {
    const r = parseKaneOutput(fx("real-unauthenticated.ndjson"), 1, fx("real-unauthenticated.stderr.txt"));
    expect(r.result).toBe("error");
    expect(r.completed).toBe(false);
    expect(r.reason).toMatch(/Not authenticated/);
    expect(r.evidence.cliVersion).toBe("0.10.6");
  });

  it("treats exit 3 without run_end as cancelled/timeout error", () => {
    const r = parseKaneOutput(fx("synthetic-timeout.ndjson"), 3);
    expect(r.result).toBe("error");
    expect(r.reason).toMatch(/timeout/);
    expect(r.evidence.steps).toHaveLength(1);
  });

  it("never reports pass when exit code is 0 but no completion event arrived", () => {
    const r = parseKaneOutput('{"type":"stream_start","surface":"run","v":1}\n', 0);
    expect(r.result).toBe("error");
  });

  it("warns when run_end says passed but exit code is nonzero (upload failure)", () => {
    const r = parseKaneOutput(fx("synthetic-pass.ndjson"), 1);
    expect(r.result).toBe("pass");
    expect(r.evidence.warnings.join(" ")).toMatch(/exited 1/);
  });

  it("uses test_md_done for testmd surfaces, not the per-step run_end (synthetic)", () => {
    const r = parseKaneOutput(fx("synthetic-testmd.ndjson"), 0);
    expect(r.result).toBe("pass");
    expect(r.durationMs).toBe(6100);
    expect(r.evidence.shareUrl).toContain("/share/");
    expect(r.evidence.steps).toHaveLength(2);
  });

  it("captures error events as the failure reason", () => {
    const p = new KaneStreamParser();
    p.push('{"type":"stream_start","surface":"run","v":1}');
    p.push('{"type":"error","message":"No start URL resolved","v":1}');
    const r = p.finish(2);
    expect(r.result).toBe("error");
    expect(r.reason).toBe("No start URL resolved");
  });
});
