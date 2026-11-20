import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isMockEnv, type MemoryEvent, type Run } from "@morrel/core";
import { dbPath, demoRaw, isDemo, withStore } from "@/lib/store";
import { absTime, clock, duration, gap, splitRemark } from "@/lib/format";
import { recoveryOf } from "@/lib/loop";
import { AutoRefresh, CopyButton, Shortcuts } from "@/components/client";
import { Page, TopBar } from "@/components/shell";
import { MockTag, RecoveredTag, ResultMark, ResultText, StatusBadge, StatusDot, TrustMark } from "@/components/status";
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
      <TopBar active="memories" dbPath={dbPath()} mock={isMockEnv()} demo={isDemo()} />
      <Suspense>
        <Shortcuts />
      </Suspense>
      {!isDemo() && <AutoRefresh seconds={5} />}
      <Page>
        {/* Breadcrumb */}
        <div className="flex h-11 items-center gap-2 text-sm text-fg-3">
          <Link href="/board" className="hover:text-fg">Memories</Link>
          <span className="text-fg-4">/</span>
          <span className="font-mono text-fg-2">{m.key}</span>
          <span className="ml-auto flex items-center gap-1.5 text-2xs text-fg-4">
            <Kbd>esc</Kbd> back
          </span>
        </div>

        {/* Title */}
        <header className="border-b border-line pb-6 pt-3">
          <div className="flex items-center gap-2.5">
            <StatusBadge status={m.status} lastResult={gated.lastRun?.result} size="md" />
            <span className="font-mono text-xs text-fg-3">v{m.version}</span>
            <span className="text-fg-4">·</span>
            <span className="font-mono text-xs text-fg-4">{m.id}</span>
          </div>
          <h1 className={`mt-3 max-w-[900px] text-[22px] font-semibold leading-8 tracking-[-0.015em] ${m.status === "retired" ? "text-fg-3 line-through decoration-fg-4" : ""}`}>
            {m.claim}
          </h1>
          <GateBanner trusted={gated.trusted} warning={gated.warning} status={m.status} />
          <LoopStrip events={events} runs={runs} />
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
                <SectionLabel right={<span className="tabular text-2xs text-fg-4">{runs.length} runs · oldest first</span>}>Run timeline</SectionLabel>
                <Timeline memoryKey={m.key} runs={runs} events={events} selectedId={selected?.id ?? null} />
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <section>
              <SectionLabel>Properties</SectionLabel>
              <dl className="divide-y divide-line rounded-md border border-line text-xs">
                <Prop k="Status"><StatusBadge status={m.status} lastResult={gated.lastRun?.result} /></Prop>
                <Prop k="Gate"><TrustMark trusted={gated.trusted} mockOnly={m.status === "verified" && m.lastRunner === "mock"} /></Prop>
                <Prop k="Key"><span className="font-mono text-fg">{m.key}</span></Prop>
                <Prop k="Version"><span className="font-mono">v{m.version}</span></Prop>
                <Prop k="Last passed"><Time iso={m.lastVerifiedAt} /></Prop>
                <Prop k="Last run at commit"><Sha sha={m.gitSha ?? gated.lastRun?.gitSha} /></Prop>
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
  const demoLines = demoRaw(run.id);
  const raw = demoLines ? { lines: demoLines } : isDemo() ? null : readRaw(run.rawNdjsonPath);
  const links: [string, string][] = [];
  if (ev.testUrl) links.push(["Test Manager", ev.testUrl]);
  const withheld = (ev as { testUrlWithheld?: boolean }).testUrlWithheld === true;
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
            {ev.screenshots.length > 0 && <span>{ev.screenshots.length} screenshots</span>}
            <span>{duration(run.durationMs)}</span>
            <span>exit {run.exitCode ?? "—"}</span>
            {run.reason && <span>{run.reason}</span>}
            {ev.cliVersion && <span>kane-cli {ev.cliVersion}</span>}
            {ev.resultCode && <span>result_code {ev.resultCode}</span>}
            {ev.reasonCode && <span>{ev.reasonCode}</span>}
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
                className={`grid grid-cols-[28px_18px_64px_minmax(0,1fr)_auto] items-start gap-2 border-b border-line px-3.5 py-2 text-[13px] last:border-b-0 ${failed ? "bg-bad-bg" : ""}`}
              >
                <span className="tabular pt-px font-mono text-2xs leading-5 text-fg-4">{String(s.index).padStart(2, "0")}</span>
                <span className="pt-[3px]"><ResultMark result={failed ? "fail" : "pass"} /></span>
                <span className="pt-px font-mono text-2xs leading-5 text-fg-3">{verb ?? "step"}</span>
                <span className="min-w-0">
                  <span className={`block break-words leading-5 ${failed ? "text-bad" : "text-fg-2"}`}>{text}</span>
                  {s.url && <span className="block truncate font-mono text-2xs leading-4 text-fg-4">{s.url}</span>}
                </span>
                {s.screenshot ? (
                  <a href={artifactUrl(s.screenshot)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[4px] border border-line-strong hover:border-fg-3" title="Step screenshot from the Kane evidence pack">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artifactUrl(s.screenshot)} alt={`Step ${s.index} screenshot`} className="block h-[54px] w-[96px] bg-white object-cover object-[50%_38%]" loading="lazy" />
                  </a>
                ) : <span />}
              </li>
            );
          })}
        </ol>
      ) : null}
      {ev.steps.length > 0 && <PagePreview run={run} />}
      {ev.steps.length === 0 && (
        <div className="px-3.5 py-4 text-sm text-fg-3">
          No steps reported.{" "}
          {run.result === "error" ? "Kane did not start the run — see the reason above and stderr below." : null}
        </div>
      )}

      {(ev.checks?.length || ev.verdict || (ev.details && ev.details !== run.summary)) && (
        <div className="space-y-3 border-t border-line px-3.5 py-3 text-xs">
          {ev.checks?.map((c) => (
            <div key={c.name} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1">
              <span className="text-fg-3">Checkpoint</span>
              <span className="text-fg">{c.condition ?? c.name}{c.analyzer && <span className="ml-2 font-mono text-2xs text-fg-4">{c.analyzer} analyzer</span>}</span>
              {c.expected !== undefined && (<><span className="text-fg-3">Expected</span><span className="font-mono text-2xs text-fg-2">{c.expected}</span></>)}
              {c.actual !== undefined && (<><span className="text-fg-3">Found</span><span className={`font-mono text-2xs ${run.result === "fail" ? "text-bad" : "text-fg-2"}`}>{c.actual}</span></>)}
            </div>
          ))}
          {ev.verdict && (
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1">
              <span className="text-fg-3">Kane triage</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {[ev.verdict.family, ev.verdict.category, ev.verdict.severity].filter(Boolean).map((t) => (
                  <span key={t} className="rounded-[4px] border border-line-strong px-1.5 font-mono text-2xs text-fg-2">{t}</span>
                ))}
                {ev.verdict.confidence != null && <span className="font-mono text-2xs text-fg-4">{Math.round(ev.verdict.confidence * 100)}% confidence</span>}
                {ev.verdict.confirmed === false && <span className="text-2xs text-fg-3">not a confirmed product bug</span>}
              </span>
              {ev.verdict.suggestion && (<><span className="text-fg-3">Suggestion</span><span className="text-fg-2">{ev.verdict.suggestion}</span></>)}
            </div>
          )}
          {ev.details && ev.details !== run.summary && <p className="whitespace-pre-line leading-5 text-fg-3">{ev.details}</p>}
        </div>
      )}

      {/* Artifacts */}
      <div className="space-y-2.5 border-t border-line bg-panel px-3.5 py-3 text-xs">
        {withheld && (
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-fg-3">Test Manager</span>
            <span className="text-fg-4">Kane uploaded this run (link withheld in the public demo)</span>
          </div>
        )}
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
        {!links.length && !withheld && !ev.evidencePackPath && !ev.sessionDir && (
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

function artifactUrl(rel: string): string {
  return process.env.MORREL_DEMO === "1" ? `/demo-artifacts/${rel}` : `/api/artifact/${rel}`;
}

/** Large view of the page Kane saw at the decisive step (the failed one, else the last). */
function PagePreview({ run }: { run: Run }) {
  const steps = run.evidence.steps.filter((s) => s.screenshot);
  if (!steps.length) return null;
  const step = steps.find((s) => s.status === "failed") ?? steps[steps.length - 1]!;
  const { verb } = splitRemark(step.remark);
  return (
    <figure className="border-t border-line bg-[#070707] px-3.5 py-3">
      <a href={artifactUrl(step.screenshot!)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[5px] border border-line-strong hover:border-fg-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artifactUrl(step.screenshot!)} alt={`Page at step ${step.index}`} className="block aspect-[16/7] w-full bg-white object-cover object-[50%_30%]" loading="lazy" />
      </a>
      <figcaption className="mt-2 flex items-center gap-2 font-mono text-2xs text-fg-3">
        <ResultMark result={step.status === "failed" ? "fail" : "pass"} />
        <span>step {String(step.index).padStart(2, "0")} · {verb ?? "step"}</span>
        {step.url && <span className="truncate text-fg-4">{step.url}</span>}
        <span className="ml-auto text-fg-4">screenshot from the Kane evidence pack</span>
      </figcaption>
    </figure>
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

/** The first check whose expectation was not met, as a short "expected / found" pair. */
function mismatch(run: Run): { expected: string; found: string } | null {
  for (const c of run.evidence.checks ?? []) {
    if (c.expected !== undefined && c.actual !== undefined && String(c.expected) !== String(c.actual)) {
      return { expected: String(c.expected), found: String(c.actual) };
    }
  }
  return null;
}

type LoopStep = { kind: "pass" | "fail" | "error" | "rewrite" | "stale" | "created"; at: string; label: string; detail?: string; runId?: string };

function loopSteps(events: MemoryEvent[], runs: Run[]): LoopStep[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  return [...events]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id))
    .flatMap((e): LoopStep[] => {
      const runId = typeof e.detail.runId === "string" ? e.detail.runId : undefined;
      const run = runId ? byId.get(runId) : undefined;
      if (e.type === "run_passed") return [{ kind: "pass", at: e.createdAt, label: `v${e.version} passed`, runId }];
      if (e.type === "run_failed") {
        const mm = run && mismatch(run);
        return [{ kind: "fail", at: e.createdAt, label: `v${e.version} failed`, detail: mm ? `found ${mm.found}` : run?.summary ?? undefined, runId }];
      }
      if (e.type === "run_error") return [{ kind: "error", at: e.createdAt, label: `v${e.version} run errored`, runId }];
      if (e.type === "updated") return [{ kind: "rewrite", at: e.createdAt, label: `rewritten → v${e.version}`, detail: Array.isArray(e.detail.changed) ? `changed ${(e.detail.changed as string[]).join(", ")}` : undefined }];
      if (e.type === "marked_stale") return [{ kind: "stale", at: e.createdAt, label: "code changed", detail: typeof e.detail.toSha === "string" ? `now at ${e.detail.toSha.slice(0, 7)}` : undefined }];
      return [];
    });
}

const STEP_TONE: Record<LoopStep["kind"], string> = {
  pass: "text-ok", fail: "text-bad", error: "text-warn", rewrite: "text-fg", stale: "text-warn", created: "text-fg-3",
};

function StepIcon({ kind }: { kind: LoopStep["kind"] }) {
  if (kind === "pass") return <ResultMark result="pass" />;
  if (kind === "fail") return <ResultMark result="fail" />;
  if (kind === "error") return <ResultMark result="error" />;
  if (kind === "stale") return <span className="inline-block size-1.5 rounded-full bg-warn" aria-hidden />;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-fg-2" aria-hidden>
      <path d="M10.5 3.5l2 2-6.75 6.75-2.75.75.75-2.75z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Compact fail → rewrite → verified summary. Shown once a memory has been through more than a single pass. */
function LoopStrip({ events, runs }: { events: MemoryEvent[]; runs: Run[] }) {
  const steps = loopSteps(events, runs);
  if (!steps.some((s) => s.kind !== "pass")) return null;
  const rec = recoveryOf(runs);
  return (
    <div className="mt-5 flex items-stretch gap-0 overflow-x-auto rounded-md border border-line bg-panel">
      <div className="flex shrink-0 flex-col justify-center border-r border-line px-3.5 py-2.5">
        <span className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">Loop</span>
        {rec ? (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-2">
            <RecoveredTag /> <span className="text-fg-4">in {gap(rec.failed.finishedAt ?? rec.failed.startedAt, rec.passed.finishedAt ?? rec.passed.startedAt)}</span>
          </span>
        ) : (
          <span className="mt-1 text-xs text-fg-4">open</span>
        )}
      </div>
      <ol className="flex min-w-0 items-stretch">
        {steps.map((st, i) => (
          <li key={i} className="flex items-center">
            {i > 0 && (
              <svg viewBox="0 0 16 16" className="mx-0.5 size-3 shrink-0 text-fg-4" aria-hidden>
                <path d="M3 8h9m-3-3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {(() => {
              const body = (
                <span className="flex flex-col px-2.5 py-2">
                  <span className={`flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${STEP_TONE[st.kind]}`}>
                    <StepIcon kind={st.kind} />
                    {st.label}
                  </span>
                  <span className="mt-0.5 flex max-w-[220px] items-center gap-1.5 whitespace-nowrap text-2xs text-fg-4">
                    <time dateTime={st.at} title={absTime(st.at)} className="tabular font-mono">{clock(st.at)}</time>
                    {st.detail && <span className="truncate text-fg-3" title={st.detail}>{st.detail}</span>}
                  </span>
                </span>
              );
              return st.runId ? (
                <Link href={`?run=${st.runId}`} scroll={false} className="rounded-[4px] hover:bg-raised">{body}</Link>
              ) : body;
            })()}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Runs and memory edits in order, so the page reads as a story: pass, fail (expected vs found), rewrite, pass. */
function Timeline({ memoryKey, runs, events, selectedId }: { memoryKey: string; runs: Run[]; events: MemoryEvent[]; selectedId: string | null }) {
  type Item = { at: string; run?: Run; event?: MemoryEvent };
  const items: Item[] = [
    ...runs.map((r) => ({ at: r.startedAt, run: r })),
    ...events.filter((e) => e.type === "updated" || e.type === "marked_stale").map((e) => ({ at: e.createdAt, event: e })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));
  return (
    <div className="overflow-hidden rounded-md border border-line">
      {items.map((it, i) => {
        if (it.event) {
          const e = it.event;
          const claim = typeof e.detail.claim === "string" ? e.detail.claim : null;
          const prev = (e.detail.previous as { claim?: string } | undefined)?.claim;
          return (
            <div key={`e${e.id}`} className="border-b border-line bg-panel px-3 py-2 text-xs last:border-b-0">
              {e.type === "updated" ? (
                <>
                  <div className="flex items-center gap-2 text-fg">
                    <StepIcon kind="rewrite" />
                    <span className="font-medium">Rewritten as v{e.version}</span>
                    <span className="text-fg-4">{Array.isArray(e.detail.changed) ? `changed ${(e.detail.changed as string[]).join(", ")}` : ""}</span>
                    <Time iso={e.createdAt} className="ml-auto text-fg-3" />
                  </div>
                  {claim && prev && claim !== prev && (
                    <div className="mt-1.5 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-0.5 pl-[22px]">
                      <span className="text-fg-4">was</span><span className="text-fg-3 line-through decoration-fg-4">{prev}</span>
                      <span className="text-fg-4">now</span><span className="text-fg-2">{claim}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-warn">
                  <StepIcon kind="stale" />
                  <span className="pl-1">{typeof e.detail.reason === "string" ? e.detail.reason : "Marked stale"}</span>
                  <Time iso={e.createdAt} className="ml-auto text-fg-3" />
                </div>
              )}
            </div>
          );
        }
        const r = it.run!;
        const on = selectedId === r.id;
        const failedStep = r.evidence.steps.find((s) => s.status === "failed");
        const mm = r.result === "fail" ? mismatch(r) : null;
        return (
          <Link
            key={r.id}
            href={`/memories/${memoryKey}?run=${r.id}`}
            scroll={false}
            className={`block border-b border-line px-3 py-2 text-xs last:border-b-0 ${on ? "bg-raised" : "hover:bg-panel"}`}
          >
            <span className="grid grid-cols-[18px_52px_minmax(0,1fr)_40px_64px_64px_72px_80px] items-center gap-3">
              <ResultMark result={r.result} />
              <ResultText result={r.result} />
              <span className="truncate text-fg-2">{r.summary ?? (failedStep ? splitRemark(failedStep.remark).text : r.reason)}</span>
              <span className="font-mono text-fg-3">v{r.memoryVersion}</span>
              <Sha sha={r.gitSha} className="text-fg-3!" />
              <span className="tabular text-right font-mono text-fg-3">{duration(r.durationMs)}</span>
              <span className="flex justify-end"><MockTag runner={r.runner} /></span>
              <Time iso={r.finishedAt} className="text-right text-fg-3" />
            </span>
            {mm && (
              <span className="mt-1 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-0.5 pl-[30px] font-mono text-2xs">
                <span className="text-fg-4">expected</span><span className="truncate text-fg-2">{mm.expected}</span>
                <span className="text-fg-4">found</span><span className="truncate text-bad">{mm.found}</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
