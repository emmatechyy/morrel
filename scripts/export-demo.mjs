#!/usr/bin/env node
/**
 * Builds the read-only public demo dataset for packages/web (MORREL_DEMO=1):
 *   - mock seed data from ./.morrel/morrel.db   (pnpm seed; every run is runner = "mock")
 *   - real Kane runs from ./.morrel/real/morrel.db (example.com flows)
 * Writes packages/web/demo/demo.json and copies real step screenshots to packages/web/public/demo-artifacts/.
 * Sanitises: LT credentials (scrub), Test Manager share links/ids (removed), home paths (~).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { MorrelStore, scrub, runsDir } from "../packages/core/dist/index.js";

const root = new URL("..", import.meta.url).pathname;
const web = join(root, "packages/web");
const artifactsOut = join(web, "public/demo-artifacts");
rmSync(artifactsOut, { recursive: true, force: true });
mkdirSync(artifactsOut, { recursive: true });
mkdirSync(join(web, "demo"), { recursive: true });

const home = process.env.HOME ?? "/home/box";
const clean = (s) =>
  scrub(String(s))
    .split(home).join("~")
    .replace(/"test_url":"[^"]*"/g, '"test_url":"[withheld in public demo]"')
    .replace(/https:\/\/test-manager\.lambdatest\.com\/[^\s"']*/g, "[Test Manager link withheld in public demo]")
    .replace(/01M7SM[A-Z0-9]{20}/g, "PROJECT_ID");

function exportDb(path, source) {
  if (!existsSync(path)) throw new Error(`missing ${path} (run pnpm seed / real verification first)`);
  const s = MorrelStore.open(path);
  const memories = s.listMemories({ includeRetired: true });
  const runs = s.listRuns({ limit: 10000 });
  const events = memories.flatMap((m) => s.listEvents(m.id));
  const raw = {};
  for (const r of runs) {
    if (r.rawNdjsonPath && existsSync(r.rawNdjsonPath)) raw[r.id] = readFileSync(r.rawNdjsonPath, "utf8").split("\n").filter(Boolean).map(clean);
    if (source === "real") {
      delete r.evidence.testUrl;
      r.evidence.testUrlWithheld = true;
      for (const st of r.evidence.steps) {
        if (!st.screenshot) continue;
        const src = join(runsDir(path), st.screenshot);
        if (existsSync(src)) {
          mkdirSync(join(artifactsOut, r.id), { recursive: true });
          copyFileSync(src, join(artifactsOut, st.screenshot));
        } else delete st.screenshot;
      }
    }
    r.rawNdjsonPath = r.rawNdjsonPath ? `.morrel/runs/${r.id}.ndjson` : null;
  }
  s.close();
  return { memories, runs, events, raw, source };
}

const parts = [exportDb(join(root, ".morrel/morrel.db"), "mock"), exportDb(join(root, ".morrel/real/morrel.db"), "real")];
const data = {
  exportedAt: new Date().toISOString(),
  note: "Read-only demo. Mock-seed timestamps are shifted to stay relative to now; real Kane runs keep their true timestamps.",
  memories: parts.flatMap((p) => p.memories.map((m) => ({ ...m, source: p.source }))),
  runs: parts.flatMap((p) => p.runs.map((r) => ({ ...r, source: p.source }))),
  events: parts.flatMap((p) => p.events.map((e) => ({ ...e, source: p.source }))),
  raw: Object.assign({}, ...parts.map((p) => p.raw)),
};
const json = clean(JSON.stringify(data));
for (const v of [process.env.LT_USERNAME, process.env.LT_ACCESS_KEY]) if (v && json.includes(v)) throw new Error("credential leaked into demo export");
writeFileSync(join(web, "demo/demo.json"), json);
console.log(`demo.json: ${data.memories.length} memories, ${data.runs.length} runs (${data.runs.filter((r) => r.runner === "kane").length} real Kane), ${(json.length / 1024).toFixed(0)} KB`);
