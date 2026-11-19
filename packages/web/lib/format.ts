export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function absTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: process.env.MORREL_TZ || "Africa/Lagos", timeZoneName: "short",
  });
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export const shortSha = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "—");

/** Splits a Kane step remark like "assert: the heading says X" into verb + text. */
export function splitRemark(remark: string): { verb: string | null; text: string } {
  // Real Kane analyze steps look like: analyze: ANALYZE(textual_visual, "the page says '...'   (truncated by Kane)
  const a = remark.match(/^analyze:\s+ANALYZE\(\w+,\s*"?(.*?)"?\)?$/i);
  if (a) return { verb: "analyze", text: a[1]!.trim() };
  const m = remark.match(/^([a-z_]{2,16}):\s+(.*)$/i);
  return m ? { verb: m[1]!.toLowerCase(), text: m[2]! } : { verb: null, text: remark };
}

/** "13:02" in the board's display zone. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: process.env.MORREL_TZ || "Africa/Lagos" });
}

export function gap(fromIso: string, toIso: string): string {
  const m = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
