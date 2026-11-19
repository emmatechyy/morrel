import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MorrelStore } from "../src/store.js";
import { verifyMemory, verifyAll } from "../src/verify.js";
import type { Evidence } from "../src/types.js";

const ev: Evidence = { mock: false, steps: [], screenshots: [], warnings: [], errors: [] };
let store: MorrelStore;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morrel-"));
  store = MorrelStore.open(join(dir, "m.db"), { trustMock: false });
});

const run = (memoryId: string, result: "pass" | "fail" | "error", runner: "kane" | "mock" = "kane", gitSha = "aaa") =>
  store.recordRun({
    memoryId, runner, result, gitSha, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    exitCode: result === "pass" ? 0 : 1, durationMs: 10, summary: "s", reason: "r", command: "kane-cli run", evidence: ev, rawNdjsonPath: null,
  });

describe("MorrelStore", () => {
  it("creates unverified, untrusted memories", () => {
    const m = store.createMemory({ claim: "Login redirects to /dashboard", flow: { objective: "Log in and verify /dashboard", url: "http://localhost:3000" } });
    expect(m.key).toBe("login-redirects-to-dashboard");
    const g = store.getMemory(m.key);
    expect(g.status).toBe("unverified");
    expect(g.trusted).toBe(false);
    expect(g.warning).toMatch(/never been verified/);
  });

  it("rejects memories without a flow", () => {
    expect(() => store.createMemory({ claim: "x", flow: {} })).toThrow(/flow/);
  });

  it("trusts only after a real passing Kane run", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    run(m.id, "pass");
    const g = store.getMemory(m.id);
    expect(g.status).toBe("verified");
    expect(g.trusted).toBe(true);
    expect(g.warning).toBeNull();
    expect(g.memory.gitSha).toBe("aaa");
  });

  it("does not trust mock passes", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    run(m.id, "pass", "mock");
    const g = store.getMemory(m.id);
    expect(g.status).toBe("verified");
    expect(g.trusted).toBe(false);
    expect(g.warning).toMatch(/mock/);
  });

  it("failed run → failed + untrusted; update → stale v2; pass → verified", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    run(m.id, "pass");
    run(m.id, "fail");
    expect(store.getMemory(m.id).status).toBe("failed");
    const u = store.updateMemory(m.id, { claim: "c2" });
    expect(u.version).toBe(2);
    expect(u.status).toBe("stale");
    expect(store.getMemory(m.id).trusted).toBe(false);
    run(m.id, "pass");
    expect(store.getMemory(m.id).trusted).toBe(true);
    const types = store.listEvents(m.id).map((e) => e.type).reverse();
    expect(types).toEqual(["created", "run_passed", "run_failed", "updated", "run_passed"]);
  });

  it("error runs never verify; a verified memory becomes stale", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    run(m.id, "error");
    expect(store.getMemory(m.id).status).toBe("unverified");
    run(m.id, "pass");
    run(m.id, "error");
    expect(store.getMemory(m.id).status).toBe("stale");
  });

  it("a run against an older version does not move status", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    store.updateMemory(m.id, { flow: { objective: "o2" } });
    store.recordRun({
      memoryId: m.id, memoryVersion: 1, runner: "kane", result: "pass", gitSha: "a", startedAt: "x", finishedAt: "y",
      exitCode: 0, durationMs: 1, summary: null, reason: null, command: null, evidence: ev, rawNdjsonPath: null,
    });
    expect(store.getMemory(m.id).status).toBe("stale");
  });

  it("marks verified memories stale on a new commit", () => {
    const a = store.createMemory({ claim: "a", flow: { objective: "o" } });
    const b = store.createMemory({ claim: "b", flow: { objective: "o" } });
    run(a.id, "pass", "kane", "sha1");
    run(b.id, "fail", "kane", "sha1");
    const staled = store.markStaleForSha("sha2");
    expect(staled.map((m) => m.key)).toEqual(["a"]);
    expect(store.getMemory("a").status).toBe("stale");
    expect(store.getMemory("b").status).toBe("failed");
  });

  it("retire removes from default list and is never trusted", () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    run(m.id, "pass");
    store.retireMemory(m.id, "feature removed");
    expect(store.listMemories()).toHaveLength(0);
    expect(store.getMemory(m.id).trusted).toBe(false);
    expect(() => store.updateMemory(m.id, { claim: "z" })).toThrow(/retired/);
  });
});

describe("verify orchestration", () => {
  it("runs the real runner against a fake kane binary and records evidence", async () => {
    const m = store.createMemory({ claim: "heading", flow: { objective: "verify heading", url: "https://example.com" } });
    process.env.MORREL_KANE_BIN = join(__dirname, "fixtures", "fake-kane.mjs");
    process.env.FAKE_KANE_FIXTURE = join(__dirname, "fixtures", "synthetic-pass.ndjson");
    process.env.FAKE_KANE_EXIT = "0";
    process.env.FAKE_KANE_ARGV = join(dir, "argv.json");
    try {
      const r = await verifyMemory(store, m.id, { cwd: dir, runsDir: join(dir, "runs"), mock: false, gitSha: "abc" });
      expect(r.run.runner).toBe("kane");
      expect(r.run.result).toBe("pass");
      expect(r.run.evidence.steps).toHaveLength(3);
      expect(r.memory.status).toBe("verified");
      const argv = JSON.parse((await import("node:fs")).readFileSync(join(dir, "argv.json"), "utf8"));
      expect(argv.slice(0, 4)).toEqual(["run", "verify heading", "--agent", "--headless"]);
      expect(argv).toContain("--url");
    } finally {
      delete process.env.MORREL_KANE_BIN;
    }
  });

  it("reports a missing kane binary as an error run", async () => {
    const m = store.createMemory({ claim: "c", flow: { objective: "o" } });
    process.env.MORREL_KANE_BIN = join(dir, "does-not-exist");
    try {
      const r = await verifyMemory(store, m.id, { cwd: dir, runsDir: join(dir, "runs"), mock: false, gitSha: null });
      expect(r.run.result).toBe("error");
      expect(r.run.reason).toMatch(/not found/);
    } finally {
      delete process.env.MORREL_KANE_BIN;
    }
  });

  it("mock verifyAll labels runs as mock and honours MORREL_MOCK_FAIL", async () => {
    store.createMemory({ key: "good", claim: "g", flow: { objective: "Open home, then verify hero" } });
    store.createMemory({ key: "bad", claim: "b", flow: { objective: "Open cart, then verify total" } });
    process.env.MORREL_MOCK_FAIL = "ba*";
    try {
      const { results } = await verifyAll(store, { cwd: dir, runsDir: join(dir, "runs"), mock: true, gitSha: "s" });
      const byKey = Object.fromEntries(results.map((r) => [r.memory.key, r]));
      expect(byKey.good!.run.result).toBe("pass");
      expect(byKey.bad!.run.result).toBe("fail");
      expect(byKey.good!.run.runner).toBe("mock");
      expect(byKey.good!.run.evidence.mock).toBe(true);
      expect(store.getMemory("good").trusted).toBe(false);
    } finally {
      delete process.env.MORREL_MOCK_FAIL;
    }
  });
});
