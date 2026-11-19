import { dirname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MEMORY_STATUSES,
  MorrelError,
  MorrelStore,
  currentGitSha,
  findProjectRoot,
  isMockEnv,
  resolveDbPath,
  runsDir,
  verifyMemory,
  type GatedMemory,
  type Run,
  type VerifyResult,
} from "@morrel/core";

export interface ServerOptions {
  dbPath?: string;
  /** Force the mock runner (tests/demos). Defaults to MORREL_KANE_MOCK=1. */
  mock?: boolean;
}

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

function runView(r: Run | null) {
  if (!r) return null;
  return {
    id: r.id,
    runner: r.runner,
    result: r.result,
    summary: r.summary,
    reason: r.reason,
    finishedAt: r.finishedAt,
    memoryVersion: r.memoryVersion,
    gitSha: r.gitSha,
    steps: r.evidence.steps.map((s) => ({ index: s.index, status: s.status, remark: s.remark })),
    checks: r.evidence.checks ?? [],
    testUrl: r.evidence.testUrl ?? null,
    evidencePackPath: r.evidence.evidencePackPath ?? null,
  };
}

function gatedView(g: GatedMemory) {
  return {
    key: g.memory.key,
    claim: g.memory.claim,
    status: g.status,
    trusted: g.trusted,
    warning: g.warning,
    version: g.memory.version,
    flow: g.memory.flow,
    lastVerifiedAt: g.memory.lastVerifiedAt,
    gitSha: g.memory.gitSha,
    lastRun: runView(g.lastRun),
  };
}

function verifyView(store: MorrelStore, r: VerifyResult) {
  return { ...gatedView(store.getMemory(r.memory.id)), run: runView(r.run) };
}

/** Builds the Morrel MCP server. Each tool call opens the SQLite DB briefly, so the CLI/board can share it. */
export function createServer(opts: ServerOptions = {}): McpServer {
  const dbPath = opts.dbPath ?? resolveDbPath();
  const root = findProjectRoot(dirname(dirname(dbPath)));
  const mock = () => opts.mock ?? isMockEnv();
  const withStore = async <T>(fn: (s: MorrelStore) => Promise<T> | T): Promise<T> => {
    const s = MorrelStore.open(dbPath);
    try {
      return await fn(s);
    } finally {
      s.close();
    }
  };
  const verifyOpts = (maxSteps?: number, timeoutSec?: number) => ({
    cwd: root,
    runsDir: runsDir(dbPath),
    mock: mock(),
    maxSteps,
    timeoutSec: timeoutSec ?? 300,
  });
  const guard = async (fn: () => Promise<ReturnType<typeof json>>) => {
    try {
      return await fn();
    } catch (e) {
      return fail(e instanceof MorrelError || e instanceof Error ? e.message : String(e));
    }
  };

  const server = new McpServer(
    { name: "morrel", version: "0.1.0" },
    {
      instructions:
        "Morrel stores claims about app behaviour, each proven by a Kane CLI browser flow. Before relying on what you " +
        "believe about the app, call memory_get. Only act on a memory when trusted is true. When a memory is failed or stale, " +
        "fix the app or rewrite it with memory_update (re-verifies), or remove it with memory_retire.",
    },
  );

  server.registerTool(
    "memory_create",
    {
      title: "Create memory",
      description: "Record a claim about app behaviour with the Kane CLI flow that proves it. Starts unverified; set verify=true to run the flow now.",
      inputSchema: {
        claim: z.string().min(1).describe("The behaviour claim, e.g. 'Login redirects to /dashboard'"),
        objective: z.string().optional().describe("Plain-English Kane objective that verifies the claim"),
        url: z.string().optional().describe("Start URL for the flow"),
        file: z.string().optional().describe("Path to a Kane *_test.md file instead of an objective"),
        key: z.string().optional().describe("Stable slug (default: derived from claim)"),
        tags: z.array(z.string()).optional(),
        verify: z.boolean().optional().describe("Run the Kane flow immediately (uses credits)"),
        maxSteps: z.number().int().positive().optional(),
      },
    },
    async (a) =>
      guard(() =>
        withStore(async (s) => {
          const m = s.createMemory({ claim: a.claim, key: a.key, tags: a.tags, flow: { objective: a.objective, url: a.url, file: a.file }, gitSha: currentGitSha(root) });
          if (!a.verify) return json(gatedView(s.getMemory(m.id)));
          return json(verifyView(s, await verifyMemory(s, m.id, verifyOpts(a.maxSteps))));
        }),
      ),
  );

  server.registerTool(
    "memory_get",
    {
      title: "Read memory through the trust gate",
      description: "Return a memory with status and trusted flag. trusted=false (failed, stale, unverified, retired, or mock-only) means do NOT rely on it.",
      inputSchema: { key: z.string().describe("Memory key or id") },
      annotations: { readOnlyHint: true },
    },
    async (a) => guard(() => withStore((s) => json(gatedView(s.getMemory(a.key))))),
  );

  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description: "List memories with their gate verdicts (failed and stale first).",
      inputSchema: {
        status: z.enum(MEMORY_STATUSES).optional(),
        search: z.string().optional(),
        includeRetired: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) =>
      guard(() =>
        withStore((s) =>
          json({
            counts: s.counts(),
            memories: s.listGated({ status: a.status, search: a.search, includeRetired: a.includeRetired }).map((g) => ({
              key: g.memory.key, claim: g.memory.claim, status: g.status, trusted: g.trusted, warning: g.warning, version: g.memory.version,
            })),
          }),
        ),
      ),
  );

  server.registerTool(
    "memory_verify",
    {
      title: "Verify memories with Kane CLI",
      description: "Run the Kane flow for one memory (key) or all non-retired memories (all=true). all=true first marks memories verified on older commits as stale. Real runs use Kane credits.",
      inputSchema: {
        key: z.string().optional(),
        all: z.boolean().optional(),
        maxSteps: z.number().int().positive().optional(),
        timeoutSec: z.number().int().positive().optional(),
      },
    },
    async (a) =>
      guard(() =>
        withStore(async (s) => {
          if (!a.key && !a.all) return fail("pass key, or all=true");
          if (a.key) return json(verifyView(s, await verifyMemory(s, a.key, verifyOpts(a.maxSteps, a.timeoutSec))));
          const sha = currentGitSha(root);
          const staled = s.markStaleForSha(sha).map((m) => m.key);
          const results = [];
          for (const m of s.listMemories()) results.push(verifyView(s, await verifyMemory(s, m.id, { ...verifyOpts(a.maxSteps, a.timeoutSec), gitSha: sha })));
          return json({ markedStale: staled, results });
        }),
      ),
  );

  server.registerTool(
    "memory_update",
    {
      title: "Rewrite memory",
      description: "Change a memory's claim and/or Kane flow. Bumps the version, marks it stale, then re-verifies (verify=false to skip).",
      inputSchema: {
        key: z.string(),
        claim: z.string().optional(),
        objective: z.string().optional(),
        url: z.string().optional(),
        file: z.string().optional(),
        tags: z.array(z.string()).optional(),
        verify: z.boolean().optional().describe("Default true"),
        maxSteps: z.number().int().positive().optional(),
      },
    },
    async (a) =>
      guard(() =>
        withStore(async (s) => {
          const flow: Record<string, string> = {};
          if (a.objective !== undefined) flow.objective = a.objective;
          if (a.url !== undefined) flow.url = a.url;
          if (a.file !== undefined) flow.file = a.file;
          const before = s.requireMemory(a.key);
          const m = s.updateMemory(a.key, { claim: a.claim, flow: Object.keys(flow).length ? flow : undefined, tags: a.tags, gitSha: currentGitSha(root) });
          if (a.verify === false || m.version === before.version) return json({ ...gatedView(s.getMemory(m.id)), reverified: false });
          return json({ ...verifyView(s, await verifyMemory(s, m.id, verifyOpts(a.maxSteps))), reverified: true });
        }),
      ),
  );

  server.registerTool(
    "memory_retire",
    {
      title: "Retire memory",
      description: "Retire a memory that no longer describes the app. Retired memories are never trusted.",
      inputSchema: { key: z.string(), reason: z.string().optional() },
      annotations: { destructiveHint: true },
    },
    async (a) => guard(() => withStore((s) => json(gatedView(s.getMemory(s.retireMemory(a.key, a.reason, currentGitSha(root)).id))))),
  );

  return server;
}
