#!/usr/bin/env node
import { Command, Option } from "commander";
import pc from "picocolors";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import {
  MorrelError,
  MorrelStore,
  MEMORY_STATUSES,
  currentGitSha,
  findProjectRoot,
  isMockEnv,
  resolveDbPath,
  runsDir,
  verifyAll,
  verifyMemory,
  type MemoryStatus,
  type VerifyResult,
} from "@morrel/core";
import { badge, gatedDetail, memoryTable, rel, resultGlyph, short } from "./format.js";
import { installHook } from "./hook.js";

const program = new Command();
program
  .name("morrel")
  .description("Memory store for coding agents. A memory is trusted only while its Kane CLI flow passes.")
  .version("0.1.0")
  .option("--db <path>", "SQLite database path (default: $MORREL_DB or <repo>/.morrel/morrel.db)")
  .option("--json", "machine-readable JSON output");

const g = () => program.opts<{ db?: string; json?: boolean }>();
const dbPath = () => (g().db ? g().db! : resolveDbPath());
const root = () => findProjectRoot(dirname(dirname(dbPath())));
const openStore = () => MorrelStore.open(dbPath());
const out = (human: string, json: unknown) => {
  if (g().json) process.stdout.write(JSON.stringify(json, null, 2) + "\n");
  else process.stdout.write(human + "\n");
};
const collect = (v: string, prev: string[]) => [...prev, v];

function verifyOpts(o: { mock?: boolean; timeout?: string; maxSteps?: string; headed?: boolean }) {
  const db = dbPath();
  return {
    cwd: root(),
    runsDir: runsDir(db),
    mock: o.mock || isMockEnv(),
    timeoutSec: o.timeout ? Number(o.timeout) : 300,
    maxSteps: o.maxSteps ? Number(o.maxSteps) : undefined,
    headless: !o.headed,
  };
}

function printResult(r: VerifyResult, quiet = false) {
  if (g().json || quiet) return;
  const run = r.run;
  const steps = run.evidence.steps;
  const failed = steps.filter((s) => s.status === "failed").length;
  if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
  console.log(
    `${resultGlyph(run)} ${pc.bold(r.memory.key.padEnd(32))} ${pc.dim(`${steps.length - failed}/${steps.length} steps · ${((run.durationMs ?? 0) / 1000).toFixed(1)}s`)}  → ${badge(r.memory.status)}`,
  );
  if (run.result !== "pass") console.log(pc.dim(`        ${run.reason ?? run.summary ?? ""}`));
}

const VERIFY_OPTS = (cmd: Command) =>
  cmd
    .option("--mock", "use the MOCK runner (synthetic; recorded as mock, never trusted)")
    .option("--timeout <sec>", "per-flow timeout in seconds", "300")
    .option("--max-steps <n>", "Kane max agent steps")
    .option("--headed", "show the browser (default: --headless)");

program
  .command("init")
  .description("create .morrel/ and the database in this repo")
  .action(() => {
    const db = dbPath();
    const s = MorrelStore.open(db);
    s.close();
    const r = findProjectRoot();
    const gi = join(r, ".gitignore");
    let ignored = false;
    if (existsSync(join(r, ".git"))) {
      const content = existsSync(gi) ? readFileSync(gi, "utf8") : "";
      if (!/^\.morrel\/?$/m.test(content)) {
        appendFileSync(gi, `${content && !content.endsWith("\n") ? "\n" : ""}.morrel/\n`);
        ignored = true;
      }
    }
    out(
      `${pc.green("✓")} morrel initialised at ${pc.bold(db)}${ignored ? pc.dim("  (.morrel/ added to .gitignore)") : ""}\n\n` +
        `  ${pc.dim("next")}  morrel add "Login redirects to /dashboard" --flow "Log in as demo@acme.dev and verify the URL is /dashboard" --url http://localhost:3000\n` +
        `        morrel verify --all\n        morrel install-hook`,
      { db },
    );
  });

program
  .command("add")
  .description("create a memory: a claim about app behaviour + the Kane flow that proves it")
  .argument("<claim>", "the claim, e.g. \"Checkout applies SAVE10 as 10% off\"")
  .option("-f, --flow <objective>", "plain-English Kane objective that verifies the claim")
  .option("-u, --url <url>", "start URL for the flow")
  .option("--file <path>", "Kane test file (*_test.md) instead of an inline objective")
  .option("-k, --key <slug>", "stable key (default: slug of claim)")
  .option("-t, --tag <tag>", "tag (repeatable)", collect, [])
  .option("--verify", "run verification right away")
  .addOption(new Option("--mock").hideHelp())
  .action(async (claim: string, o) => {
    const s = openStore();
    const m = s.createMemory({ claim, key: o.key, tags: o.tag, flow: { objective: o.flow, url: o.url, file: o.file }, gitSha: currentGitSha(root()) });
    if (!g().json) console.log(`${pc.green("✓")} created ${pc.bold(m.key)} ${pc.dim(`(${m.id})`)} ${badge(m.status)}`);
    if (o.verify) {
      const r = await verifyMemory(s, m.id, verifyOpts(o));
      printResult(r);
      out("", { memory: r.memory, run: r.run });
      process.exitCode = r.run.result === "pass" ? 0 : 1;
    } else {
      if (!g().json) console.log(pc.dim(`  run: morrel verify ${m.key}`));
      else out("", m);
    }
  });

program
  .command("list")
  .alias("ls")
  .description("list memories (failed and stale first)")
  .addOption(new Option("-s, --status <status>", "filter by status").choices([...MEMORY_STATUSES]))
  .option("-a, --all", "include retired")
  .option("-q, --search <text>", "search key/claim/flow")
  .action((o) => {
    const s = openStore();
    const rows = s.listGated({ status: o.status as MemoryStatus | undefined, includeRetired: o.all, search: o.search });
    const c = s.counts();
    const summary = pc.dim(`${c.total} memories · `) + [
      pc.green(`${c.verified} verified`), pc.red(`${c.failed} failed`), pc.yellow(`${c.stale} stale`), pc.gray(`${c.unverified} unverified`),
    ].join(pc.dim(" · "));
    out(`${summary}\n\n${memoryTable(rows.map((r) => r.memory))}`, rows.map((r) => ({ ...r.memory, trusted: r.trusted, warning: r.warning })));
  });

program
  .command("get")
  .description("read a memory through the trust gate (agents: use --json --strict)")
  .argument("<key>", "memory key or id")
  .option("--strict", "exit 3 if the memory is not trusted")
  .action((key: string, o) => {
    const s = openStore();
    const gm = s.getMemory(key);
    const runs = s.listRuns({ memoryId: gm.memory.id, limit: 10 });
    out(gatedDetail(gm, runs), {
      key: gm.memory.key,
      claim: gm.memory.claim,
      status: gm.status,
      trusted: gm.trusted,
      warning: gm.warning,
      version: gm.memory.version,
      flow: gm.memory.flow,
      lastVerifiedAt: gm.memory.lastVerifiedAt,
      gitSha: gm.memory.gitSha,
      lastRun: gm.lastRun && {
        id: gm.lastRun.id, runner: gm.lastRun.runner, result: gm.lastRun.result, summary: gm.lastRun.summary,
        reason: gm.lastRun.reason, finishedAt: gm.lastRun.finishedAt, steps: gm.lastRun.evidence.steps,
        testUrl: gm.lastRun.evidence.testUrl ?? null, evidencePackPath: gm.lastRun.evidence.evidencePackPath ?? null,
      },
    });
    if (o.strict && !gm.trusted) process.exitCode = 3;
  });

VERIFY_OPTS(
  program
    .command("verify")
    .description("run Kane flows and update trust (one memory, or --all)")
    .argument("[key]", "memory key or id")
    .option("--all", "mark stale for the current commit, then re-verify every non-retired memory")
    .option("--stale-only", "with --all: only re-run memories that are not verified")
    .option("--quiet", "no per-memory output"),
).action(async (key: string | undefined, o) => {
  const s = openStore();
  const opts = verifyOpts(o);
  if (opts.mock && !g().json && !o.quiet) console.log(pc.magenta("MOCK runner — results are synthetic and will not be trusted.\n"));
  let results: VerifyResult[] = [];
  if (o.all || !key) {
    if (!o.all && !key) {
      console.error("usage: morrel verify <key> | morrel verify --all");
      process.exitCode = 2;
      return;
    }
    const sha = currentGitSha(opts.cwd);
    const staled = s.markStaleForSha(sha);
    if (staled.length && !g().json && !o.quiet) console.log(pc.yellow(`${staled.length} memor${staled.length === 1 ? "y" : "ies"} marked stale for ${short(sha)}`));
    const targets = s.listMemories().filter((m) => !o.staleOnly || m.status !== "verified");
    for (const m of targets) {
      if (!g().json && !o.quiet) process.stdout.write(pc.dim(`  running ${m.key}…\r`));
      const r = await verifyMemory(s, m.id, { ...opts, gitSha: sha });
      results.push(r);
      printResult(r, o.quiet);
    }
  } else {
    const r = await verifyMemory(s, key, opts);
    results = [r];
    printResult(r, o.quiet);
  }
  const bad = results.filter((r) => r.run.result !== "pass");
  if (g().json) out("", results.map((r) => ({ key: r.memory.key, status: r.memory.status, run: r.run })));
  else if (!o.quiet && results.length > 1) console.log(pc.dim(`\n${results.length - bad.length}/${results.length} passed`));
  if (bad.length) process.exitCode = 1;
});

VERIFY_OPTS(
  program
    .command("update")
    .description("rewrite a memory's claim or flow (bumps version → stale → re-verifies)")
    .argument("<key>", "memory key or id")
    .option("-c, --claim <claim>", "new claim")
    .option("-f, --flow <objective>", "new Kane objective")
    .option("-u, --url <url>", "new start URL")
    .option("--file <path>", "new Kane test file")
    .option("-t, --tag <tag>", "replace tags (repeatable)", collect, [])
    .option("--no-verify", "do not re-run the flow now"),
).action(async (key: string, o) => {
  const s = openStore();
  const flow: Record<string, string> = {};
  if (o.flow !== undefined) flow.objective = o.flow;
  if (o.url !== undefined) flow.url = o.url;
  if (o.file !== undefined) flow.file = o.file;
  const before = s.requireMemory(key);
  const m = s.updateMemory(key, { claim: o.claim, flow: Object.keys(flow).length ? flow : undefined, tags: o.tag.length ? o.tag : undefined, gitSha: currentGitSha(root()) });
  if (!g().json) console.log(m.version === before.version ? pc.dim("no behavioural change") : `${pc.green("✓")} ${pc.bold(m.key)} v${before.version} → v${m.version} ${badge(m.status)}`);
  if (o.verify && m.version !== before.version) {
    const r = await verifyMemory(s, m.id, verifyOpts(o));
    printResult(r);
    if (g().json) out("", { memory: r.memory, run: r.run });
    if (r.run.result !== "pass") process.exitCode = 1;
  } else if (g().json) out("", m);
});

program
  .command("retire")
  .description("retire a memory that no longer describes the app")
  .argument("<key>", "memory key or id")
  .option("-r, --reason <text>", "why")
  .action((key: string, o) => {
    const s = openStore();
    const m = s.retireMemory(key, o.reason, currentGitSha(root()));
    out(`${pc.green("✓")} retired ${pc.bold(m.key)}${o.reason ? pc.dim(` — ${o.reason}`) : ""}`, m);
  });

program
  .command("runs")
  .description("recent verification runs")
  .argument("[key]", "limit to one memory")
  .option("-n, --limit <n>", "how many", "20")
  .action((key: string | undefined, o) => {
    const s = openStore();
    const mem = key ? s.requireMemory(key) : null;
    const runs = s.listRuns({ memoryId: mem?.id, limit: Number(o.limit) });
    const keys = new Map(s.listMemories({ includeRetired: true }).map((m) => [m.id, m.key]));
    const lines = runs.map((r) => `${resultGlyph(r)} ${pc.dim(rel(r.finishedAt).padEnd(9))} ${pc.bold((keys.get(r.memoryId) ?? r.memoryId).padEnd(32))} ${pc.dim(short(r.gitSha))}  ${r.summary ?? r.reason ?? ""}`);
    out(lines.length ? lines.join("\n") : pc.dim("No runs yet. Run: morrel verify --all"), runs);
  });

program
  .command("import-run")
  .description("record a real kane-cli --agent run captured outside Morrel (e.g. in CI)")
  .argument("<key>", "memory key or id")
  .argument("<ndjson>", "captured stdout of `kane-cli run ... --agent`")
  .requiredOption("--exit <code>", "kane-cli exit code")
  .option("--stderr <file>", "captured stderr (for the evidence pack hint)")
  .action(async (key: string, file: string, o) => {
    const { parseKaneOutput, attachEvidencePack, scrub, newId } = await import("@morrel/core");
    const { readFileSync, writeFileSync, mkdirSync, statSync } = await import("node:fs");
    const s = openStore();
    const m = s.requireMemory(key);
    const stdout = scrub(readFileSync(file, "utf8"));
    const stderr = o.stderr ? scrub(readFileSync(o.stderr, "utf8")) : "";
    const exit = Number(o.exit);
    const parsed = parseKaneOutput(stdout, exit, stderr);
    if (parsed.evidence.cliVersion === "mock") throw new MorrelError("refusing to import a mock stream as a real run", "invalid");
    const id = newId("run");
    const dir = runsDir(dbPath());
    mkdirSync(dir, { recursive: true });
    const rawPath = join(dir, `${id}.ndjson`);
    writeFileSync(rawPath, stdout);
    attachEvidencePack(parsed.evidence, join(dir, id), id);
    const lines = stdout.split("\n").filter((l) => l.startsWith("{"));
    const tsOf = (l: string | undefined) => { try { return (JSON.parse(l ?? "{}") as { ts?: string }).ts; } catch { return undefined; } };
    const startedAt = tsOf(lines[0]) ?? statSync(file).mtime.toISOString();
    const finishedAt = tsOf(lines[lines.length - 1]) ?? startedAt;
    const { run, memory } = s.recordRun({
      id, memoryId: m.id, runner: "kane", startedAt, finishedAt, result: parsed.result, exitCode: exit,
      durationMs: parsed.durationMs ?? Date.parse(finishedAt) - Date.parse(startedAt), summary: parsed.summary, reason: parsed.reason,
      gitSha: currentGitSha(root()), command: `imported from ${file}`, evidence: parsed.evidence, rawNdjsonPath: rawPath,
    });
    out(`${resultGlyph(run)} imported real run ${run.id} → ${badge(memory.status)}`, { run, memory });
  });

program
  .command("mark-stale")
  .description("mark verified memories stale if verified against an older commit (used by hooks)")
  .action(() => {
    const s = openStore();
    const sha = currentGitSha(root());
    const staled = s.markStaleForSha(sha);
    out(`${staled.length} marked stale for ${short(sha)}`, staled.map((m) => m.key));
  });

program
  .command("install-hook")
  .description("install a git hook that marks memories stale and re-verifies")
  .addOption(new Option("--hook <kind>", "which hook").choices(["post-commit", "pre-push"]).default("post-commit"))
  .action((o) => {
    let gitDir: string;
    try {
      gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      throw new MorrelError("not inside a git repository", "invalid");
    }
    const { path, replaced } = installHook(gitDir, o.hook);
    out(
      `${pc.green("✓")} ${replaced ? "updated" : "installed"} ${o.hook} hook at ${path}\n` +
        pc.dim(o.hook === "post-commit"
          ? "  every commit: stale-mark memories verified on older commits, then `morrel verify --all` in background"
          : "  every push: `morrel verify --all`; push is blocked if any memory fails"),
      { path, hook: o.hook, replaced },
    );
  });

program.parseAsync().catch((err: unknown) => {
  if (err instanceof MorrelError) {
    if (g().json) process.stdout.write(JSON.stringify({ error: err.message, code: err.code }) + "\n");
    else console.error(`${pc.red("error")} ${err.message}`);
    process.exitCode = err.code === "not_found" ? 4 : 2;
  } else {
    console.error(err);
    process.exitCode = 2;
  }
});

