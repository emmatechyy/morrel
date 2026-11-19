import pc from "picocolors";
import type { GatedMemory, Memory, MemoryStatus, Run } from "@morrel/core";

const STATUS_COLOR: Record<MemoryStatus, (s: string) => string> = {
  verified: pc.green,
  failed: pc.red,
  stale: pc.yellow,
  unverified: pc.gray,
  retired: (s) => pc.dim(pc.strikethrough(s)),
};
const STATUS_GLYPH: Record<MemoryStatus, string> = {
  verified: "●",
  failed: "●",
  stale: "●",
  unverified: "○",
  retired: "–",
};

export function badge(status: MemoryStatus): string {
  return STATUS_COLOR[status](`${STATUS_GLYPH[status]} ${status.padEnd(10)}`);
}

export function rel(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const short = (sha: string | null) => (sha ? sha.slice(0, 7) : "—");

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function memoryTable(rows: Memory[]): string {
  if (!rows.length) return pc.dim("No memories yet. Add one:\n  morrel add \"<claim>\" --flow \"<Kane objective>\" --url <start url>");
  const keyW = Math.min(32, Math.max(3, ...rows.map((r) => r.key.length)));
  const cols = process.stdout.columns || 120;
  const claimW = Math.max(20, cols - keyW - 12 - 12 - 10 - 8);
  const head = pc.dim(`${"STATUS".padEnd(14)}${"KEY".padEnd(keyW + 2)}${"CLAIM".padEnd(claimW + 2)}${"VERIFIED".padEnd(11)}SHA`);
  const lines = rows.map((m) => {
    const mock = m.lastRunner === "mock" ? pc.magenta(" mock") : "";
    return `${badge(m.status)}  ${pc.bold(trunc(m.key, keyW).padEnd(keyW))}  ${trunc(m.claim, claimW).padEnd(claimW)}  ${pc.dim(rel(m.lastVerifiedAt).padEnd(9))}  ${pc.dim(short(m.gitSha))}${mock}`;
  });
  return [head, ...lines].join("\n");
}

export function gatedDetail(g: GatedMemory, runs: Run[] = []): string {
  const m = g.memory;
  const out: string[] = [];
  out.push(`${badge(m.status)} ${pc.bold(m.key)} ${pc.dim(`v${m.version} · ${m.id}`)}`);
  out.push(g.trusted ? pc.green("trusted  ✓ latest Kane run passed") : pc.red(`trusted  ✗ ${g.warning ?? ""}`));
  out.push("");
  out.push(`${pc.dim("claim    ")}${m.claim}`);
  if (m.flow.objective) out.push(`${pc.dim("flow     ")}${pc.cyan(m.flow.objective)}`);
  if (m.flow.url) out.push(`${pc.dim("url      ")}${m.flow.url}`);
  if (m.flow.file) out.push(`${pc.dim("file     ")}${m.flow.file}`);
  out.push(`${pc.dim("verified ")}${rel(m.lastVerifiedAt)} ${pc.dim(`@ ${short(m.gitSha)}`)}`);
  if (m.statusReason) out.push(`${pc.dim("reason   ")}${m.statusReason}`);
  const r = g.lastRun;
  if (r) {
    out.push("");
    out.push(pc.dim(`last run ${r.id} · ${r.runner === "mock" ? pc.magenta("MOCK") : "kane"} · ${r.result} · ${((r.durationMs ?? 0) / 1000).toFixed(1)}s · ${rel(r.finishedAt)}`));
    for (const s of r.evidence.steps) {
      out.push(`  ${s.status === "done" ? pc.green("✓") : pc.red("✗")} ${pc.dim(String(s.index).padStart(2))}  ${s.remark}`);
    }
    if (r.evidence.testUrl) out.push(`  ${pc.dim("test manager")} ${r.evidence.testUrl}`);
    if (r.evidence.evidencePackPath) out.push(`  ${pc.dim("evidence    ")} kane-cli evidence serve ${r.evidence.evidencePackPath}`);
    if (r.rawNdjsonPath) out.push(`  ${pc.dim("raw ndjson  ")} ${r.rawNdjsonPath}`);
  }
  if (runs.length > 1) {
    out.push("");
    out.push(pc.dim("history"));
    for (const x of runs.slice(0, 8)) out.push(`  ${resultGlyph(x)} ${pc.dim(rel(x.finishedAt).padEnd(9))} v${x.memoryVersion}  ${x.summary ?? x.reason ?? ""}`);
  }
  return out.join("\n");
}

export function resultGlyph(r: Run): string {
  const g = r.result === "pass" ? pc.green("pass ") : r.result === "fail" ? pc.red("fail ") : pc.yellow("error");
  return r.runner === "mock" ? `${g}${pc.magenta("·m")}` : `${g}  `;
}
