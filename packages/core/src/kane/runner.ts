import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Flow } from "../types.js";
import { KaneStreamParser, type ParsedRun } from "./parser.js";

export interface KaneRunOptions {
  flow: Flow;
  /** Working directory for kane-cli (its `.testmuai/` context lives here). */
  cwd: string;
  /** Where to tee the raw NDJSON stdout. */
  rawPath: string;
  /** Kill after N seconds (passed to kane-cli `--timeout`, plus a hard local kill at +30s). */
  timeoutSec?: number;
  maxSteps?: number;
  headless?: boolean;
  /** Binary to spawn. Default: MORREL_KANE_BIN or `kane-cli`. */
  bin?: string;
  onEvent?: (e: Record<string, unknown>) => void;
  onStderr?: (chunk: string) => void;
}

export interface KaneRunOutcome extends ParsedRun {
  exitCode: number | null;
  command: string;
  wallMs: number;
}

/** Builds kane-cli argv for a flow. Credentials are never placed in the returned display command. */
export function buildKaneArgs(opts: Pick<KaneRunOptions, "flow" | "timeoutSec" | "maxSteps" | "headless">): string[] {
  const { flow } = opts;
  const args: string[] = [];
  if (flow.file) {
    args.push("testmd", "run", flow.file, "--agent");
  } else if (flow.objective) {
    args.push("run", flow.objective, "--agent");
    if (opts.headless !== false) args.push("--headless");
    if (flow.url) args.push("--url", flow.url);
    if (opts.maxSteps) args.push("--max-steps", String(opts.maxSteps));
  } else {
    throw new Error("flow has neither objective nor file");
  }
  if (opts.timeoutSec) args.push("--timeout", String(opts.timeoutSec));
  return args;
}

function quote(a: string): string {
  return /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawns the real Kane CLI in agent mode, streams NDJSON through the parser,
 * and tees raw stdout to `rawPath`.
 *
 * Auth: either a prior `kane-cli login`, or LT_USERNAME / LT_ACCESS_KEY in the
 * environment (forwarded as `--username` / `--access-key`; only on `run`).
 */
export function runKane(opts: KaneRunOptions): Promise<KaneRunOutcome> {
  const bin = opts.bin ?? process.env.MORREL_KANE_BIN ?? "kane-cli";
  const args = buildKaneArgs(opts);
  const display = [bin, ...args].map(quote).join(" ");
  const user = process.env.LT_USERNAME;
  const key = process.env.LT_ACCESS_KEY;
  const spawnArgs = [...args];
  if (user && key && !opts.flow.file) spawnArgs.push("--username", user, "--access-key", key);

  mkdirSync(dirname(opts.rawPath), { recursive: true });
  const raw = createWriteStream(opts.rawPath);
  const parser = new KaneStreamParser();
  const started = Date.now();

  return new Promise((resolve) => {
    let stderr = "";
    let buf = "";
    let settled = false;
    const child = spawn(/*turbopackIgnore: true*/ bin, spawnArgs, {
      cwd: opts.cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"], // stdin not a TTY → Kane disables ask_user
    });

    const hardKill = opts.timeoutSec
      ? setTimeout(() => child.kill("SIGKILL"), (opts.timeoutSec + 30) * 1000)
      : null;

    const feed = (line: string) => {
      const ev = parser.push(line);
      if (ev) opts.onEvent?.(ev);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      raw.write(chunk);
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        feed(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
      opts.onStderr?.(chunk);
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      if (hardKill) clearTimeout(hardKill);
      if (buf) feed(buf);
      raw.end();
      const parsed = parser.finish(exitCode, stderr);
      resolve({ ...parsed, exitCode, command: display, wallMs: Date.now() - started });
    };

    child.on("error", (err: NodeJS.ErrnoException) => {
      stderr += err.code === "ENOENT"
        ? `kane-cli not found (${bin}). Install with: npm install -g @testmuai/kane-cli`
        : String(err);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
