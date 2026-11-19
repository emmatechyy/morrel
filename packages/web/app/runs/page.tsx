import Link from "next/link";
import { Suspense } from "react";
import { isMockEnv, type RunResult } from "@morrel/core";
import { dbPath, isDemo, withStore } from "@/lib/store";
import { duration, splitRemark } from "@/lib/format";
import { AutoRefresh, Shortcuts } from "@/components/client";
import { Page, TopBar } from "@/components/shell";
import { MockTag, ResultMark, ResultText, StatusBadge } from "@/components/status";
import { Code, Kbd, Sha, Time } from "@/components/ui";

export const dynamic = "force-dynamic";

const RESULTS: (RunResult | "all")[] = ["all", "fail", "error", "pass"];

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const sp = await searchParams;
  const filter = RESULTS.includes(sp.result as RunResult) ? (sp.result as RunResult) : undefined;
  const { runs, memories } = withStore((s) => ({
    runs: s.listRuns({ limit: 300 }),
    memories: new Map(s.listMemories({ includeRetired: true }).map((m) => [m.id, m])),
  }));
  const counts = { all: runs.length, pass: 0, fail: 0, error: 0 } as Record<string, number>;
  for (const r of runs) if (r.result) counts[r.result]! += 1;
  const shown = filter ? runs.filter((r) => r.result === filter) : runs;
  const mockCount = runs.filter((r) => r.runner === "mock").length;

  return (
    <>
      <TopBar active="runs" dbPath={dbPath()} mock={isMockEnv()} demo={isDemo()} />
      <Suspense>
        <Shortcuts />
      </Suspense>
      {!isDemo() && <AutoRefresh seconds={5} />}
      <Page>
        <section className="flex items-end justify-between gap-6 pb-5 pt-8">
          <div>
            <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">Runs</h1>
            <p className="mt-1 text-sm text-fg-3">Every Kane CLI verification, newest first. Each row is one flow execution against one memory version.</p>
          </div>
          {mockCount > 0 && (
            <p className="max-w-[340px] text-right text-2xs leading-4 text-fg-3">
              <MockTag runner="mock" className="mr-1 align-middle" /> {mockCount} of {runs.length} runs came from the mock runner. They are
              synthetic and never make a memory trusted.
            </p>
          )}
        </section>

        <div className="flex h-11 items-center gap-1 border-y border-line">
          {RESULTS.map((f) => {
            const on = (filter ?? "all") === f;
            return (
              <Link
                key={f}
                href={f === "all" ? "/runs" : `/runs?result=${f}`}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm capitalize ${on ? "bg-raised text-fg ring-1 ring-line-strong" : "text-fg-3 hover:bg-panel hover:text-fg-2"}`}
              >
                {f === "all" ? "All" : f}
                <span className={`tabular font-mono text-2xs ${on ? "text-fg-2" : "text-fg-4"}`}>{counts[f]}</span>
              </Link>
            );
          })}
        </div>

        {runs.length === 0 ? (
          <div className="py-16 text-center text-sm text-fg-3">
            No runs yet. Run <Code>morrel verify --all</Code> to execute every memory&apos;s Kane flow.
          </div>
        ) : (
          <div role="table">
            <div className="grid h-8 grid-cols-[18px_48px_200px_minmax(0,1fr)_104px_64px_72px_88px] items-center gap-4 border-b border-line px-3 text-2xs font-medium uppercase tracking-[0.06em] text-fg-4">
              <span />
              <span>Result</span>
              <span>Memory</span>
              <span>Outcome</span>
              <span>Memory now</span>
              <span className="text-right">Time</span>
              <span>Commit</span>
              <span className="text-right">When</span>
            </div>
            {shown.map((r) => {
              const m = memories.get(r.memoryId);
              const failed = r.evidence.steps.find((s) => s.status === "failed");
              const href = m ? `/memories/${m.key}?run=${r.id}` : "#";
              return (
                <Link
                  key={r.id}
                  href={href}
                  data-row
                  data-href={href}
                  className="grid h-11 grid-cols-[18px_48px_200px_minmax(0,1fr)_104px_64px_72px_88px] items-center gap-4 border-b border-line px-3 text-xs hover:bg-panel"
                >
                  <ResultMark result={r.result} />
                  <ResultText result={r.result} />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-fg">{m?.key ?? r.memoryId}</span>
                    <span className="shrink-0 font-mono text-2xs text-fg-4">v{r.memoryVersion}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <MockTag runner={r.runner} />
                    <span className="truncate text-fg-2">{r.summary ?? (failed ? splitRemark(failed.remark).text : r.reason)}</span>
                  </span>
                  <span>{m ? <StatusBadge status={m.status} /> : null}</span>
                  <span className="tabular text-right font-mono text-fg-3">{duration(r.durationMs)}</span>
                  <Sha sha={r.gitSha} />
                  <Time iso={r.finishedAt} className="text-right text-fg-3" />
                </Link>
              );
            })}
          </div>
        )}
        <footer className="mt-4 flex justify-end gap-3 text-2xs text-fg-4">
          <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        </footer>
      </Page>
    </>
  );
}
