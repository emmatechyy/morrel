import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { runsDir } from "@morrel/core";
import { dbPath } from "@/lib/store";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

/** Serves evidence artifacts (step screenshots) extracted under <db dir>/runs/<run id>/. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = normalize(runsDir(dbPath()));
  const file = normalize(join(base, ...path));
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  if (!file.startsWith(base + sep) || !TYPES[ext]) return new Response("not found", { status: 404 });
  try {
    const data = await readFile(file);
    return new Response(new Uint8Array(data), { headers: { "content-type": TYPES[ext]!, "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
