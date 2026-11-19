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

describe("real kane-cli 0.10.6 streams", () => {
  it("parses a real failed run: numeric result_code, pack path on stdout, checks and verdict", () => {
    const r = parseKaneOutput(fx("real-fail-stale-heading.ndjson"), 1, fx("real-fail-stale-heading.stderr.txt"));
    expect(r.result).toBe("fail");
    expect(r.completed).toBe(true);
    expect(r.durationMs).toBe(23500);
    expect(r.summary).toMatch(/^The check expected an old page heading/); // one_liner preferred
    expect(r.evidence.details).toMatch(/outdated test expectation/);
    expect(r.evidence.resultCode).toBe("710");
    expect(r.evidence.reasonCode).toBe("assertion_error.final_verification");
    expect(r.evidence.evidencePackPath).toMatch(/\/evidence\/[0-9a-f-]+\.evidence$/);
    expect(r.evidence.testUrl).toContain("test-manager.lambdatest.com");
    expect(r.evidence.creditsConsumed).toBeCloseTo(12.457, 2);
    expect(r.evidence.steps.map((s) => s.status)).toEqual(["done", "done", "failed"]);
    expect(r.evidence.steps[1]!.remark).toMatch(/^analyze:/);
    expect(r.evidence.checks?.[0]).toMatchObject({ expected: "Example Domain", actual: "No visible main page heading", analyzer: "visual" });
    expect(r.evidence.verdict).toMatchObject({ status: "broken", family: "automation_bug", category: "config_issue", confirmed: false });
    expect(r.evidence.finalState).toBeUndefined(); // empty {} is dropped
  });

  it("parses a real passing run (exit 0, result_code 100, no verdict)", () => {
    const r = parseKaneOutput(fx("real-pass.ndjson"), 0, fx("real-pass.stderr.txt"));
    expect(r.result).toBe("pass");
    expect(r.summary).toBe("confirmed the documentation notice on example.com");
    expect(r.evidence.resultCode).toBe("100");
    expect(r.evidence.reasonCode).toBe("success.complete");
    expect(r.evidence.steps).toHaveLength(3);
    expect(r.evidence.steps.every((s) => s.status === "done")).toBe(true);
    expect(r.evidence.verdict).toBeUndefined();
    expect(r.evidence.finalState).toMatchObject({ documentation_examples_text_present: "true" });
    expect(r.evidence.evidencePackPath).toMatch(/\.evidence$/);
    expect(r.evidence.warnings).toHaveLength(0);
  });

  it("parses a real failing run where the claim is simply false (result_code 750)", () => {
    const r = parseKaneOutput(fx("real-fail-hello-world.ndjson"), 1, fx("real-fail-hello-world.stderr.txt"));
    expect(r.result).toBe("fail");
    expect(r.evidence.resultCode).toBe("750");
    expect(r.evidence.steps.some((s) => s.status === "failed")).toBe(true);
    expect(r.summary).toMatch(/Hello World/);
  });
});
