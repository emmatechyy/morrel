import type { MemoryStatus, RunResult, Runner } from "@morrel/core";

const STYLES: Record<MemoryStatus, { text: string; dot: string; box: string; label: string }> = {
  verified: { text: "text-ok", dot: "bg-ok", box: "bg-ok-bg border-ok-line", label: "Verified" },
  failed: { text: "text-bad", dot: "bg-bad", box: "bg-bad-bg border-bad-line", label: "Failed" },
  stale: { text: "text-warn", dot: "bg-warn", box: "bg-warn-bg border-warn-line", label: "Stale" },
  unverified: { text: "text-idle", dot: "border border-idle bg-transparent", box: "bg-idle-bg border-idle-line", label: "Unverified" },
  retired: { text: "text-fg-4 line-through", dot: "bg-fg-4", box: "bg-transparent border-line", label: "Retired" },
};

const ERROR_STYLE = { text: "text-warn", dot: "bg-warn", box: "bg-warn-bg border-warn-line", label: "Error" };

/**
 * A memory whose only runs errored (Kane could not execute) is still "unverified" in the store,
 * but the board must not pretend it was never run: it shows "Error" instead.
 */
export function StatusBadge({ status, lastResult, size = "sm" }: { status: MemoryStatus; lastResult?: RunResult | null; size?: "sm" | "md" }) {
  const s = status === "unverified" && lastResult === "error" ? ERROR_STYLE : STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border font-medium ${s.box} ${s.text} ${
        size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-2xs"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function StatusDot({ status }: { status: MemoryStatus }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${STYLES[status].dot}`} aria-hidden />;
}

export function statusLabel(status: MemoryStatus) {
  return STYLES[status].label;
}

export function ResultMark({ result }: { result: RunResult | null }) {
  if (result === "pass")
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-ok" aria-label="pass">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (result === "fail")
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-bad" aria-label="fail">
        <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  if (result === "error")
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-warn" aria-label="error">
        <path d="M8 4.5v4.25M8 11.25v.25" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  return <span className="inline-block size-3.5 text-center text-fg-4">·</span>;
}

export function ResultText({ result }: { result: RunResult | null }) {
  const cls = result === "pass" ? "text-ok" : result === "fail" ? "text-bad" : result === "error" ? "text-warn" : "text-fg-3";
  return <span className={`font-mono text-2xs uppercase tracking-wide ${cls}`}>{result ?? "—"}</span>;
}

/** Marks synthetic runs. Never omitted when a run came from the mock runner. */
export function MockTag({ runner, className = "" }: { runner: Runner | null | undefined; className?: string }) {
  if (runner !== "mock") return null;
  return (
    <span
      title="Synthetic result from MORREL_KANE_MOCK — not a real Kane CLI run, never trusted by the read gate"
      className={`inline-flex h-4 items-center rounded-[3px] border border-dashed border-fg-4 px-1 font-mono text-[10px] leading-none tracking-wider text-fg-2 ${className}`}
    >
      MOCK
    </span>
  );
}

/** Failed at some point, then passed again on the real runner: the loop closed. */
export function RecoveredTag({ title }: { title?: string }) {
  return (
    <span title={title ?? "Kane caught a failure, the memory was fixed, and a real run passed again"} className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] leading-none text-ok/90">
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
        <path d="M12.5 6.5A4.75 4.75 0 1 0 12.75 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12.75 3.5v3.25H9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      recovered
    </span>
  );
}

export function TrustMark({ trusted, mockOnly = false }: { trusted: boolean; mockOnly?: boolean }) {
  if (!trusted && mockOnly)
    return (
      <span title="Last pass came from the mock runner; the read gate does not trust it" className="inline-flex items-center gap-1 text-xs text-fg-2">
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M8 1.75l5 2v3.5c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-3.5l5-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" />
        </svg>
        Mock only
      </span>
    );
  return trusted ? (
    <span className="inline-flex items-center gap-1 text-xs text-ok">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
        <path d="M8 1.75l5 2v3.5c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-3.5l5-2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.75 8l1.6 1.6 3-3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Trusted
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-fg-3">
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
        <path d="M8 1.75l5 2v3.5c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-3.5l5-2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.75 8h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      Gated
    </span>
  );
}
