/**
 * Reads a sealed Kane evidence pack (`.evidence`, a standard zip) and extracts per-step
 * screenshots next to the run's raw NDJSON, so the board can show them without Kane's viewer.
 * Layout observed on kane-cli 0.10.6: tests/<slug>/steps/<ordinal>-<flow>-<n>/{step.json,screenshot.jpg}.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type { Evidence } from "../types.js";

export function attachEvidencePack(evidence: Evidence, runDirAbs: string, runDirRel: string): void {
  const pack = evidence.evidencePackPath?.replace(/^~(?=\/)/, process.env.HOME ?? "~");
  if (!pack || !existsSync(pack)) return;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(readFileSync(pack), {
      filter: (f) => /\/steps\/[^/]+\/(step\.json|screenshot\.(jpe?g|png))$/.test(f.name) && f.originalSize < 8_000_000,
    });
  } catch {
    return;
  }
  const steps = new Map<string, { ordinal: number; url?: string; shot?: Uint8Array; ext?: string }>();
  for (const [name, data] of Object.entries(files)) {
    const m = name.match(/\/steps\/([^/]+)\/(step\.json|screenshot\.(jpe?g|png))$/);
    if (!m) continue;
    const dir = m[1]!;
    const entry = steps.get(dir) ?? { ordinal: Number(dir.split("-")[0]) || 0 };
    if (m[2] === "step.json") {
      try {
        const j = JSON.parse(strFromU8(data)) as { ordinal?: number; url?: string };
        if (typeof j.ordinal === "number") entry.ordinal = j.ordinal;
        entry.url = j.url;
      } catch { /* ignore */ }
    } else {
      entry.shot = data;
      entry.ext = m[3];
    }
    steps.set(dir, entry);
  }
  const ordered = [...steps.values()].sort((a, b) => a.ordinal - b.ordinal);
  if (!ordered.length) return;
  mkdirSync(runDirAbs, { recursive: true });
  evidence.screenshots = [];
  ordered.forEach((s, i) => {
    let rel: string | undefined;
    if (s.shot) {
      const file = `step-${String(s.ordinal || i + 1).padStart(2, "0")}.${s.ext === "png" ? "png" : "jpg"}`;
      writeFileSync(join(runDirAbs, file), s.shot);
      rel = `${runDirRel}/${file}`;
      evidence.screenshots.push(rel);
    }
    const step = evidence.steps[i];
    if (step) {
      if (rel) step.screenshot = rel;
      if (s.url) step.url = s.url;
    }
  });
}
