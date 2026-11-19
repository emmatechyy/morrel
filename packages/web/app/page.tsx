import Link from "next/link";
import { Suspense } from "react";
import { MEMORY_STATUSES, isMockEnv, type MemoryStatus } from "@morrel/core";
import { dbPath, withStore } from "@/lib/store";
import { AutoRefresh, SearchBox, Shortcuts } from "@/components/client";
import { Page, TopBar } from "@/components/shell";
import { MockTag, ResultMark, StatusBadge, TrustMark } from "@/components/status";
import { Code, Kbd, Sha, Time } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS: (MemoryStatus | "all")[] = ["all", "failed", "stale", "unverified", "verified", "retired"];
const FILTER_LABEL: Record<string, string> = { all: "All", failed: "Failed", stale: "Stale", unverified: "Unverified", verified: "Verified", retired: "Retired" };
const FILTER_DOT: Record<string, string> = { all: "", failed: "bg-bad", stale: "bg-warn", unverified: "border border-idle", verified: "bg-ok", retired: "bg-fg-4" };

export default async function Board({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = MEMORY_STATUSES.includes(sp.status as MemoryStatus) ? (sp.status as MemoryStatus) : undefined;
  const q = sp.q?.trim() || undefined;

  const data = withStore((s) => {
    const rows = s.listGated({ status, search: q });
    const allTrusted = s.listGated({}).filter((g) => g.trusted).length;
    return { rows, counts: s.counts(), allTrusted, lastRun: s.listRuns({ limit: 1 })[0] ?? null };
  });
  const { rows, counts } = data;
  const trusted = rows.filter((r) => r.trusted).length;
  const total = counts.total + counts.retired;
  const empty = total === 0;
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("status", f);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <TopBar active="memories" dbPath={dbPath()} mock={isMockEnv()} />
      <Suspense>
        <Shortcuts filters={FILTERS} />
      </Suspense>
      <AutoRefresh seconds={5} />
      <Page>
        {/* Header */}
        <section className="flex items-end justify-between gap-6 pb-5 pt-8">
          <div>
            <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">Memories</h1>
            <p className="mt-1 max-w-[620px] text-sm text-fg-3">
              Claims about app behaviour, each linked to a Kane CLI flow. A memory reaches an agent as trusted only while
              its latest flow run passes.
            </p>
          </div>
          {!empty && (
            <div className="flex shrink-0 items-center gap-6 pb-0.5">
              <Stat label="Trusted" value={String(data.allTrusted)} sub={`of ${counts.total}`} tone={data.allTrusted ? "ok" : undefined} />
              <Stat label="Needs attention" value={String(counts.failed + counts.stale)} sub="failed + stale" tone={counts.failed ? "bad" : counts.stale ? "warn" : undefined} />
              <Stat label="Last run" value={<Time iso={data.lastRun?.finishedAt} />} />
            </div>
          )}
        </section>

        {empty ? (
          <EmptyState />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex h-11 items-center justify-between gap-4 border-y border-line">
              <nav className="-mb-px flex h-full items-center gap-1" aria-label="Filter by status">
                {FILTERS.map((f, i) => {
                  const n = f === "all" ? counts.total : counts[f];
                  const on = (status ?? "all") === f;
                  return (
                    <Link
                      key={f}
                      href={href(f)}
                      title={`Press ${i + 1}`}
                      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
                        on ? "bg-raised text-fg ring-1 ring-line-strong" : "text-fg-3 hover:bg-panel hover:text-fg-2"
                      }`}
                    >
                      {FILTER_DOT[f] && <span className={`size-1.5 rounded-full ${FILTER_DOT[f]}`} />}
                      {FILTER_LABEL[f]}
                      <span className={`tabular font-mono text-2xs ${on ? "text-fg-2" : "text-fg-4"}`}>{n}</span>
                    </Link>
                  );
                })}
              </nav>
              <Suspense>
                <SearchBox />
              </Suspense>
            </div>

            {/* Table */}
            <div role="table" className="text-sm">
              <div role="row" className="grid h-8 grid-cols-[112px_minmax(0,1fr)_92px_128px_84px_44px] items-center gap-4 border-b border-line px-3 text-2xs font-medium uppercase tracking-[0.06em] text-fg-4">
                <span>Status</span>
                <span>Memory</span>
                <span>Gate</span>
                <span>Last run</span>
                <span>Commit</span>
                <span className="text-right">Ver</span>
              </div>
              {rows.length === 0 && (
                <div className="px-3 py-10 text-center text-sm text-fg-3">
                  No memories match{q ? <> “{q}”</> : null}
                  {status ? <> with status {FILTER_LABEL[status]?.toLowerCase()}</> : null}.
                </div>
              )}
              {rows.map(({ memory: m, trusted, lastRun }) => (
                <Link
                  key={m.id}
                  href={`/memories/${m.key}`}
                  data-row
                  data-href={`/memories/${m.key}`}
                  role="row"
                  className="grid min-h-[52px] grid-cols-[112px_minmax(0,1fr)_92px_128px_84px_44px] items-center gap-4 border-b border-line px-3 py-2 transition-colors hover:bg-panel"
                >
                  <span>
                    <StatusBadge status={m.status} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${m.status === "retired" ? "text-fg-3 line-through decoration-fg-4" : "text-fg"}`}>
                      {m.claim}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-3">
                      <span className="shrink-0 font-mono text-fg-2">{m.key}</span>
                      <span className="text-fg-4">·</span>
                      {(m.status === "failed" || m.status === "stale") && m.statusReason ? (
                        <span className={`truncate ${m.status === "failed" ? "text-bad/80" : "text-warn/80"}`}>
                          {m.statusReason.replace(/^Kane flow failed \(mock runner\): |^Kane flow failed: /, "").replace(/^MOCK: /, "")}
                        </span>
                      ) : (
                        <span className="truncate font-mono text-fg-4">{m.flow.file ?? m.flow.objective}</span>
                      )}
                    </span>
                  </span>
                  <span>
                    <TrustMark trusted={trusted} mockOnly={m.status === "verified" && m.lastRunner === "mock"} />
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-2">
                    <ResultMark result={lastRun?.result ?? null} />
                    <Time iso={lastRun?.finishedAt} />
                    <MockTag runner={lastRun?.runner} />
                  </span>
                  <span>
                    <Sha sha={m.gitSha} />
                  </span>
                  <span className="tabular text-right font-mono text-xs text-fg-3">v{m.version}</span>
                </Link>
              ))}
            </div>

            <footer className="mt-4 flex items-center justify-between text-2xs text-fg-4">
              <span className="tabular">
                {rows.length} shown · {trusted} trusted
              </span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
                <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
                <span className="flex items-center gap-1"><Kbd>1</Kbd>–<Kbd>6</Kbd> filter</span>
                <span className="flex items-center gap-1"><Kbd>/</Kbd> search</span>
              </span>
            </footer>
          </>
        )}
      </Page>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "ok" | "bad" | "warn" }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="min-w-[92px] border-l border-line pl-4">
      <div className="text-2xs uppercase tracking-[0.06em] text-fg-4">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`tabular text-[18px] font-semibold leading-6 ${c}`}>{value}</span>
        {sub && <span className="text-2xs text-fg-4">{sub}</span>}
      </div>
    </div>
  );
}

function EmptyState() {
  const steps: [string, string][] = [
    ["Initialise the store", "morrel init"],
    ["Record a claim with the Kane flow that proves it", 'morrel add "Login redirects to /dashboard" \\\n  --flow "Log in as demo@acme.dev, then verify the URL is /dashboard" \\\n  --url http://localhost:3000'],
    ["Run Kane and gate the memory on the result", "morrel verify --all"],
    ["Re-verify on every commit", "morrel install-hook"],
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-10 border-t border-line pt-8">
      <ol className="space-y-6">
        {steps.map(([title, cmd], i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="flex size-6 items-center justify-center rounded-full border border-line-strong font-mono text-2xs text-fg-2">{i + 1}</span>
            <div>
              <div className="text-sm text-fg">{title}</div>
              <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-panel px-3 py-2.5 font-mono text-xs leading-5 text-fg-2">
                <span className="select-none text-fg-4">$ </span>
                {cmd}
              </pre>
            </div>
          </li>
        ))}
      </ol>
      <aside className="text-sm text-fg-3">
        <div className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">No memories yet</div>
        <p className="mt-3">
          Morrel stores what your coding agent believes about the app, and refuses to vouch for it unless a Kane CLI run
          proves it on the current code.
        </p>
        <p className="mt-3">
          Agents read through the gate: <Code>morrel get &lt;key&gt; --json --strict</Code> exits non-zero for failed,
          stale or unverified memories.
        </p>
        <p className="mt-3">
          Want sample data? <Code>pnpm seed</Code>
        </p>
      </aside>
    </div>
  );
}
