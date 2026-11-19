import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isMockEnv, type MemoryEvent, type Run } from "@morrel/core";
import { dbPath, withStore } from "@/lib/store";
import { duration, splitRemark } from "@/lib/format";
import { AutoRefresh, CopyButton, Shortcuts } from "@/components/client";
import { Page, TopBar } from "@/components/shell";
import { MockTag, ResultMark, ResultText, StatusBadge, StatusDot, TrustMark } from "@/components/status";
import { Code, ExternalLink, Kbd, SectionLabel, Sha, Time } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MemoryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ run?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const data = withStore((s) => {
    const m = s.findMemory(decodeURIComponent(key));
    if (!m) return null;
    return { gated: s.getMemory(m.id), runs: s.listRuns({ memoryId: m.id, limit: 50 }), events: s.listEvents(m.id) };
  });
  if (!data) notFound();
  const { gated, runs, events } = data;
  const m = gated.memory;
  const selected = (sp.run && runs.find((r) => r.id === sp.run)) || runs[0] || null;

  return (
    <>
      <TopBar active="memories" dbPath={dbPath()} mock={isMockEnv()} />
      <Suspense>
        <Shortcuts />
      </Suspense>
      <AutoRefresh seconds={5} />
      <Page>
        {/* Breadcrumb */}
        <div className="flex h-11 items-center gap-2 text-sm text-fg-3">
          <Link href="/" className="hover:text-fg">Memories</Link>
          <span className="text-fg-4">/</span>
          <span className="font-mono text-fg-2">{m.key}</span>
          <span className="ml-auto flex items-center gap-1.5 text-2xs text-fg-4">
            <Kbd>esc</Kbd> back
          </span>
        </div>

        {/* Title */}
        <header className="border-b border-line pb-6 pt-3">
          <div className="flex items-center gap-2.5">
            <StatusBadge status={m.status} size="md" />
            <span className="font-mono text-xs text-fg-3">v{m.version}</span>
            <span className="text-fg-4">·</span>
            <span className="font-mono text-xs text-fg-4">{m.id}</span>
          </div>
          <h1 className={`mt-3 max-w-[900px] text-[22px] font-semibold leading-8 tracking-[-0.015em] ${m.status === "retired" ? "text-fg-3 line-through decoration-fg-4" : ""}`}>
            {m.claim}
          </h1>
          <GateBanner trusted={gated.trusted} warning={gated.warning} status={m.status} />
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-10 pt-6">
          {/* Main column */}
          <div className="min-w-0 space-y-8">
            <section>
              <SectionLabel right={<span className="text-2xs text-fg-4">{m.flow.file ? "kane-cli testmd run" : "kane-cli run"}</span>}>Kane flow</SectionLabel>
              <div className="overflow-hidden rounded-md border border-line bg-panel">
                {m.flow.url && (
                  <div className="flex items-center gap-3 border-b border-line px-3.5 py-2 font-mono text-xs">
                    <span className="w-10 text-fg-4">url</span>
                    <span className="text-fg-2">{m.flow.url}</span>
                  </div>
                )}
                {m.flow.file && (
                  <div className="flex items-center gap-3 border-b border-line px-3.5 py-2 font-mono text-xs">
                    <span className="w-10 text-fg-4">file</span>
                    <span className="text-fg-2">{m.flow.file}</span>
                  </div>
                )}
                {m.flow.objective && <p className="whitespace-pre-wrap px-3.5 py-3 font-mono text-[12.5px] leading-[21px] text-fg">{m.flow.objective}</p>}
              </div>
            </section>

            <section>
              <SectionLabel
                right={
                  selected && (
                    <span className="flex items-center gap-2 text-2xs text-fg-4">
                      <span className="font-mono">{selected.id}</span>
                    </span>
                  )
                }
              >
                Evidence
              </SectionLabel>
              {selected ? <Evidence run={selected} currentVersion={m.version} /> : <NoRuns memoryKey={m.key} />}
            </section>

            {runs.length > 0 && (
              <section>
                <SectionLabel right={<span className="tabular text-2xs text-fg-4">{runs.length} runs</span>}>Run timeline</SectionLabel>
                <div className="overflow-hidden rounded-md border border-line">
                  {runs.map((r) => {
                    const on = selected?.id === r.id;
                    const failedStep = r.evidence.steps.find((s) => s.status === "failed");
                    return (
                      <Link
                        key={r.id}
                        href={`/memories/${m.key}?run=${r.id}`}
                        scroll={false}
                        className={`grid grid-cols-[18px_52px_minmax(0,1fr)_40px_64px_72px_80px] items-center gap-3 border-b border-line px-3 py-2 text-xs last:border-b-0 ${
                          on ? "bg-raised" : "hover:bg-panel"
                        }`}
                      >
                        <ResultMark result={r.result} />
                        <ResultText result={r.result} />
                        <span className="truncate text-fg-2">{failedStep ? splitRemark(failedStep.remark).text : r.summary ?? r.reason}</span>
                        <span className="font-mono text-fg-3">v{r.memoryVersion}</span>
                        <span className="tabular text-right font-mono text-fg-3">{duration(r.durationMs)}</span>
                        <span className="flex justify-end"><MockTag runner={r.runner} /></span>
                        <Time iso={r.finishedAt} className="text-right text-fg-3" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <section>
              <SectionLabel>Properties</SectionLabel>
              <dl className="divide-y divide-line rounded-md border border-line text-xs">
                <Prop k="Status"><StatusBadge status={m.status} /></Prop>
                <Prop k="Gate"><TrustMark trusted={gated.trusted} mockOnly={m.status === "verified" && m.lastRunner === "mock"} /></Prop>
                <Prop k="Key"><span className="font-mono text-fg">{m.key}</span></Prop>
                <Prop k="Version"><span className="font-mono">v{m.version}</span></Prop>
                <Prop k="Verified"><Time iso={m.lastVerifiedAt} /></Prop>
                <Prop k="At commit"><Sha sha={m.gitSha} /></Prop>
                <Prop k="Runner">{m.lastRunner ? <span className="flex items-center gap-1.5 font-mono">{m.lastRunner === "kane" ? "kane-cli" : "mock"}<MockTag runner={m.lastRunner} /></span> : <span className="text-fg-4">—</span>}</Prop>
                <Prop k="Created"><Time iso={m.createdAt} /></Prop>
                <Prop k="Updated"><Time iso={m.updatedAt} /></Prop>
                {m.tags.length > 0 && (
                  <Prop k="Tags">
                    <span className="flex flex-wrap justify-end gap-1">
                      {m.tags.map((t) => (
                        <span key={t} className="rounded-[4px] border border-line px-1.5 font-mono text-2xs text-fg-2">{t}</span>
                      ))}
                    </span>
                  </Prop>
                )}
              </dl>
              {m.statusReason && <p className="mt-2.5 text-xs leading-5 text-fg-3">{m.statusReason}</p>}
            </section>

            <section>
              <SectionLabel>Agent commands</SectionLabel>
              <div className="space-y-1.5">
                {[
                  [`morrel get ${m.key} --json --strict`, "read through gate"],
                  [`morrel verify ${m.key}`, "re-run flow"],
                  [`morrel update ${m.key} --flow "…"`, "rewrite → re-verify"],
                  [`morrel retire ${m.key} -r "…"`, "retire"],
                ].map(([cmd, hint]) => (
                  <div key={cmd} className="group flex items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-2xs text-fg-2">{cmd}</div>
                      <div className="text-[10px] text-fg-4">{hint}</div>
                    </div>
                    <CopyButton text={cmd!} />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionLabel>History</SectionLabel>
              <ol className="relative ml-1 border-l border-line">
                {events.map((e) => (
                  <EventItem key={e.id} e={e} memoryKey={m.key} />
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </Page>
    </>
  );
}

const BANNER: Record<string, [string, string]> = {
  failed: ["border-bad", "text-bad"],
  stale: ["border-warn", "text-warn"],
  unverified: ["border-idle", "text-idle"],
  verified: ["border-fg-3", "text-fg-2"],
  retired: ["border-fg-4", "text-fg-3"],
};

function GateBanner({ trusted, warning, status }: { trusted: boolean; warning: string | null; status: string }) {
  if (trusted)
    return (
      <div className="mt-4 flex items-center gap-2.5 border-l-2 border-ok py-1 pl-3 text-sm">
        <span className="text-ok">Trusted.</span>
        <span className="text-fg-3">The latest Kane run of this version passed at the commit shown. Agents receive it without a warning.</span>
      </div>
    );
  const [head, ...rest] = (warning ?? "Untrusted.").split(" Reason: ");
  const label = head!.split(":")[0];
  const rawBody = head!.slice(label!.length + 1).trim();
  const body = rawBody.charAt(0).toUpperCase() + rawBody.slice(1);
  return (
    <div className={`mt-4 border-l-2 py-1 pl-3 text-sm ${BANNER[status]![0]}`}>
      <div>
        <span className={`font-medium ${BANNER[status]![1]}`}>{label === "RETIRED" ? "Retired." : "Gated."}</span>{" "}
        <span className="text-fg-2">{body}</span>
      </div>
      {rest.length > 0 && <div className="mt-0.5 font-mono text-xs text-fg-3">{rest.join(" Reason: ")}</div>}
    </div>
  );
}

function Prop({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 px-3 py-1.5">
      <dt className="text-fg-3">{k}</dt>
      <dd className="text-right text-fg-2">{children}</dd>
    </div>
  );
}

function Evidence({ run, currentVersion }: { run: Run; currentVersion: number }) {
  const ev = run.evidence;
  const done = ev.steps.filter((s) => s.status === "done").length;
  const raw = readRaw(run.rawNdjsonPath);
  const links: [string, string][] = [];
  if (ev.testUrl) links.push(["Test Manager", ev.testUrl]);
  if (ev.shareUrl) links.push(["Share link", ev.shareUrl]);
  if (ev.reportUrl) links.push(["Report", ev.reportUrl]);
  if (ev.videoUrl) links.push(["Video", ev.videoUrl]);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      {/* Summary strip */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-line bg-panel px-3.5 py-3">
        <div className="pt-0.5"><ResultMark result={run.result} /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ResultText result={run.result} />
            <MockTag runner={run.runner} />
            {run.memoryVersion !== currentVersion && (
              <span className="rounded-[3px] border border-line px-1 font-mono text-[10px] text-fg-3">ran against v{run.memoryVersion}</span>
            )}
            <span className="text-sm text-fg">{run.summary ?? run.reason ?? "No summary"}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs text-fg-3">
            <span>{done}/{ev.steps.length} steps</span>
            <span>{duration(run.durationMs)}</span>
            <span>exit {run.exitCode ?? "—"}</span>
            {run.reason && <span>{run.reason}</span>}
            {ev.cliVersion && <span>kane-cli {ev.cliVersion}</span>}
            {ev.resultCode && <span>result_code {ev.resultCode}</span>}
            {ev.creditsConsumed != null && <span>{Math.round(ev.creditsConsumed * 10) / 10} credits</span>}
            <span>@ <Sha sha={run.gitSha} className="text-2xs! text-fg-3!" /></span>
            <Time iso={run.finishedAt} />
          </div>
        </div>
      </div>

      {/* Steps */}
      {ev.steps.length > 0 ? (
        <ol>
          {ev.steps.map((s) => {
            const { verb, text } = splitRemark(s.remark);
            const failed = s.status === "failed";
            return (
              <li
                key={s.index}
                className={`grid grid-cols-[28px_18px_64px_minmax(0,1fr)] items-start gap-2 border-b border-line px-3.5 py-2 text-[13px] last:border-b-0 ${failed ? "bg-bad-bg" : ""}`}
              >
                <span className="tabular pt-px font-mono text-2xs leading-5 text-fg-4">{String(s.index).padStart(2, "0")}</span>
                <span className="pt-[3px]"><ResultMark result={failed ? "fail" : "pass"} /></span>
                <span className="pt-px font-mono text-2xs leading-5 text-fg-3">{verb ?? "step"}</span>
                <span className={`leading-5 ${failed ? "text-bad" : "text-fg-2"}`}>{text}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="px-3.5 py-4 text-sm text-fg-3">
          No steps reported.{" "}
          {run.result === "error" ? "Kane did not start the run — see the reason above and stderr below." : null}
        </div>
      )}

      {/* Artifacts */}
      <div className="space-y-2.5 border-t border-line bg-panel px-3.5 py-3 text-xs">
        {links.length > 0 && (
          <div className="flex flex-wrap items-center gap-4">
            {links.map(([label, href]) => (
              <ExternalLink key={label} href={href}>{label}</ExternalLink>
            ))}
          </div>
        )}
        {ev.evidencePackPath && (
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-fg-3">Evidence pack</span>
            <code className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-2">kane-cli evidence serve {ev.evidencePackPath}</code>
            <CopyButton text={`kane-cli evidence serve ${ev.evidencePackPath}`} />
          </div>
        )}
        {ev.sessionDir && (
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-fg-3">Session</span>
            <code className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-2">{ev.sessionDir}</code>
          </div>
        )}
        {ev.screenshots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {ev.screenshots.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-2xs text-link hover:underline">{src.split("/").pop()}</a>
            ))}
          </div>
        )}
        {!links.length && !ev.evidencePackPath && !ev.sessionDir && (
          <div className="text-fg-4">
            {run.runner === "mock" ? "Mock runs produce no Test Manager link, screenshots or evidence pack." : "Kane reported no artifact links for this run."}
          </div>
        )}
        {ev.finalState && Object.keys(ev.finalState).length > 0 && (
          <div>
            <div className="mb-1 text-fg-3">Stored values</div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 font-mono text-2xs">
              {Object.entries(ev.finalState).map(([k, v]) => (
                <Fragment key={k}><span className="text-fg-3">{k}</span><span className="text-fg">{JSON.stringify(v)}</span></Fragment>
              ))}
            </div>
          </div>
        )}
        {ev.warnings.map((w, i) => (
          <div key={"w" + i} className="flex gap-2 text-warn"><span className="font-mono text-2xs">warn</span><span>{w}</span></div>
        ))}
        {ev.errors.map((w, i) => (
          <div key={"e" + i} className="flex gap-2 text-bad"><span className="font-mono text-2xs">error</span><span>{w}</span></div>
        ))}
      </div>

      {/* Raw */}
      {(raw || ev.stderrTail) && (
        <details className="border-t border-line">
          <summary className="flex h-9 cursor-pointer select-none items-center gap-2 px-3.5 text-xs text-fg-3 hover:text-fg-2">
            <svg viewBox="0 0 16 16" className="chev size-3 transition-transform" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Raw NDJSON
            {raw && <span className="font-mono text-2xs text-fg-4">{raw.lines.length} lines · {run.rawNdjsonPath}</span>}
          </summary>
          <div className="max-h-[420px] overflow-auto border-t border-line bg-[#070707] py-2 font-mono text-[11.5px] leading-[19px]">
            {raw?.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[40px_minmax(0,1fr)] px-2 hover:bg-panel">
                <span className="select-none pr-3 text-right text-fg-4">{i + 1}</span>
                <span className="whitespace-pre-wrap break-all"><JsonLine line={l} /></span>
              </div>
            ))}
            {ev.stderrTail && (
              <div className="mt-2 border-t border-line px-3 pt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-4">stderr (tail)</div>
                <pre className="whitespace-pre-wrap text-fg-3">{ev.stderrTail}</pre>
              </div>
            )}
          </div>
        </details>
      )}
      {run.command && (
        <div className="flex items-center gap-2 border-t border-line px-3.5 py-2">
          <span className="select-none font-mono text-2xs text-fg-4">$</span>
          <code className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-3">{run.command}</code>
          <CopyButton text={run.command.replace(/^\[mock\] /, "")} />
        </div>
      )}
    </div>
  );
}

function JsonLine({ line }: { line: string }) {
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return <span className="text-fg-4">{line}</span>;
  }
  const entries = Object.entries(obj!).filter(([k]) => k !== "v");
  return (
    <>
      <span className="text-fg-4">{"{"}</span>
      {entries.map(([k, v], i) => {
        const tone =
          k === "type" ? "text-fg" :
          k === "status" ? (v === "failed" ? "text-bad" : v === "passed" || v === "done" ? "text-ok" : "text-fg-2") :
          k === "ts" ? "text-fg-4" : "text-fg-2";
        return (
          <span key={k}>
            <span className="text-[#7d8590]">{JSON.stringify(k)}</span>
            <span className="text-fg-4">:</span>
            <span className={tone}>{JSON.stringify(v)}</span>
            {i < entries.length - 1 && <span className="text-fg-4">, </span>}
          </span>
        );
      })}
      <span className="text-fg-4">{"}"}</span>
    </>
  );
}

function readRaw(path: string | null): { lines: string[] } | null {
  if (!path || !existsSync(path)) return null;
  try {
    if (statSync(path).size > 2_000_000) return { lines: ["(raw stream larger than 2 MB — open the file directly)"] };
    return { lines: readFileSync(path, "utf8").split("\n").filter(Boolean) };
  } catch {
    return null;
  }
}

function NoRuns({ memoryKey }: { memoryKey: string }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-fg-3">
      Never run. Verify it with <Code>morrel verify {memoryKey}</Code> — until a Kane run passes, agents reading this
      memory get it flagged as unverified.
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Rewritten",
  retired: "Retired",
  run_passed: "Flow passed",
  run_failed: "Flow failed",
  run_error: "Run errored",
  marked_stale: "Marked stale",
};

function EventItem({ e, memoryKey }: { e: MemoryEvent; memoryKey: string }) {
  const runId = typeof e.detail.runId === "string" ? e.detail.runId : null;
  const changed = Array.isArray(e.detail.changed) ? (e.detail.changed as string[]).join(", ") : null;
  const reason = typeof e.detail.reason === "string" ? e.detail.reason : null;
  const mock = e.detail.runner === "mock";
  return (
    <li className="relative pb-4 pl-4 last:pb-0">
      <span className="absolute -left-[4.5px] top-[5px] flex size-2 items-center justify-center rounded-full bg-bg">
        {e.toStatus ? <StatusDot status={e.toStatus} /> : <span className="size-2 rounded-full bg-fg-4" />}
      </span>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-fg">
          {EVENT_LABEL[e.type] ?? e.type}
          <span className="ml-1.5 font-mono text-2xs text-fg-4">v{e.version}</span>
          {mock && <MockTag runner="mock" className="ml-1.5 align-middle" />}
        </span>
        <Time iso={e.createdAt} className="shrink-0 text-2xs text-fg-4" />
      </div>
      {(changed || reason || runId) && (
        <div className="mt-0.5 truncate text-2xs text-fg-3">
          {changed && <>changed {changed}</>}
          {reason && !changed && <>{reason}</>}
          {runId && (
            <Link href={`/memories/${memoryKey}?run=${runId}`} scroll={false} className="font-mono text-fg-3 hover:text-link">
              {runId}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
