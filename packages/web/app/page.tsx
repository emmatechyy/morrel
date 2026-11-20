import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell";

export const metadata = {
  title: "Morrel — verified memory for coding agents",
  description: "Morrel links every memory a coding agent keeps about your app to a Kane CLI flow, and only trusts it while the flow passes.",
};

const REPO = "https://github.com/emmatechyy/morrel";
/** Set once the demo video is published; the hero link only renders when it exists. */
const VIDEO_URL: string | null = null;

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-[880px] items-center px-6">
        <Link href="/" className="flex items-center gap-2 text-fg">
          <Logo />
          <span className="font-mono text-[13px] font-semibold tracking-tight">morrel</span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm text-fg-3">
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
          <Link href="/board" className="text-fg hover:text-fg-2">Open the board</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-[880px] px-6">
        {/* Intro */}
        <section className="pb-20 pt-24 sm:pt-32">
          <h1 className="max-w-[640px] text-[36px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[44px]">
            Memory your coding agent can actually trust.
          </h1>
          <p className="mt-5 max-w-[560px] text-base leading-[26px] text-fg-2">
            Morrel keeps the notes an AI agent writes about how your app behaves, and checks each one against the real
            app with a Kane CLI test. If the test stops passing, the agent stops believing the note.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/board"
              className="inline-flex h-9 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg transition-colors hover:bg-fg-2"
            >
              See the live board
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-line-strong px-4 text-sm text-fg-2 transition-colors hover:border-fg-4 hover:text-fg"
            >
              Read the code
            </a>
            {VIDEO_URL && (
              <a href={VIDEO_URL} target="_blank" rel="noreferrer" className="ml-2 text-sm text-fg-2 underline-offset-4 hover:text-fg hover:underline">
                Watch the 90-second demo
              </a>
            )}
          </div>
        </section>

        <Row label="About">
          <p>
            Coding agents remember things between sessions: &ldquo;orders over $50 ship free&rdquo;, &ldquo;login lands on
            the account page&rdquo;. Morrel is where those memories live. Each one is a plain sentence paired with a short
            browser test that proves it.
          </p>
        </Row>

        <Row label="Problem">
          <p>
            Apps change, but memories don&rsquo;t. A rule that was true last week quietly becomes false, and the agent keeps
            acting on it, writing code and tests on top of a fact nobody re-checked.
          </p>
        </Row>

        <Row label="Solution">
          <p>
            Morrel runs every memory&rsquo;s test with Kane CLI and only serves it as trusted while that test passes. When
            one fails, the agent is warned before it reads it, rewrites the memory, and Morrel tests it again.
          </p>
          <Example />
        </Row>

        <Row label="How an agent uses it">
          <p>
            Morrel runs as an MCP server, so any agent that speaks MCP (Claude Code, Cursor) can read memories through the
            gate. Three lines to set it up:
          </p>
          <Code label="terminal">
            <Line><Dim>$</Dim> git clone {REPO} &amp;&amp; cd morrel</Line>
            <Line><Dim>$</Dim> pnpm install &amp;&amp; pnpm build</Line>
            <Line><Dim>$</Dim> claude mcp add morrel -e MORREL_DB=$PWD/.morrel/morrel.db -- node $PWD/packages/mcp/dist/index.js</Line>
          </Code>
          <p>
            Before acting on something it remembers, the agent calls <InlineCode>memory_get</InlineCode>. Here is the
            real answer for the coupon memory Kane caught on the demo shop:
          </p>
          <Code label="memory_get → checkout-save10-discount" note="Excerpt of a real response. Steps and evidence links trimmed.">
            <Line>{"{"}</Line>
            <Line>  <K>&quot;claim&quot;</K>: <S>&quot;Coupon SAVE10 takes 10% off the subtotal at checkout&quot;</S>,</Line>
            <Line>  <K>&quot;status&quot;</K>: <span className="text-bad">&quot;failed&quot;</span>,</Line>
            <Line>  <K>&quot;trusted&quot;</K>: <span className="text-bad">false</span>,</Line>
            <Line>  <K>&quot;warning&quot;</K>: <S>&quot;UNTRUSTED: the linked Kane flow failed. Do not rely on this memory; update or retire it. Reason: Kane flow failed: The test expected a discount from SAVE10, but the checkout reported that this coupon had expired.&quot;</S>,</Line>
            <Line>  <K>&quot;lastRun&quot;</K>: {"{"} <K>&quot;runner&quot;</K>: <S>&quot;kane&quot;</S>, <K>&quot;result&quot;</K>: <span className="text-bad">&quot;fail&quot;</span>, <K>&quot;finishedAt&quot;</K>: <S>&quot;2026-11-19T12:22:40Z&quot;</S> {"}"}</Line>
            <Line>{"}"}</Line>
          </Code>
          <p>
            <InlineCode>trusted: false</InlineCode> tells the agent not to build on it. It either fixes the app or calls{" "}
            <InlineCode>memory_update</InlineCode> with a corrected claim, which Morrel re-tests with Kane before trusting
            it again.
          </p>
        </Row>
      </main>

      <footer className="mx-auto mt-24 max-w-[880px] px-6 text-sm text-fg-3">
        <p className="border-t border-line py-8">
        Built by Sniper for the{" "}
        <span className="text-fg-2">KaneCLI Hackathon</span> by{" "}
        <a href="https://www.testmuai.com" target="_blank" rel="noreferrer" className="text-fg-2 hover:text-fg">TestMu AI</a>.
        </p>
      </footer>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-10 sm:grid-cols-[160px_1fr] sm:gap-10">
      <h2 className="text-sm font-medium text-fg-3">{label}</h2>
      <div className="max-w-[600px] space-y-6 text-base leading-[26px] text-fg">{children}</div>
    </section>
  );
}

/** The real checkout-free-shipping history from the demo, in three lines. */
function Example() {
  const steps: { dot: string; title: string; note: string }[] = [
    { dot: "bg-ok", title: "Orders over $50 ship free", note: "Kane run passed" },
    { dot: "bg-bad", title: "Shop raised the threshold to $75", note: "Kane run failed: expected Free, found $6.95" },
    { dot: "bg-ok", title: "Free shipping starts at $75", note: "Memory rewritten, Kane run passed again" },
  ];
  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-mono text-xs text-fg-2">checkout-free-shipping</span>
        <Link href="/memories/checkout-free-shipping" className="text-xs text-fg-3 hover:text-fg">See the real runs</Link>
      </div>
      <ol className="px-4 py-3">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-3 py-2">
            {i < steps.length - 1 && <span className="absolute left-[3px] top-[18px] h-[calc(100%-6px)] w-px bg-line-strong" aria-hidden />}
            <span className={`mt-[7px] size-[7px] shrink-0 rounded-full ${s.dot}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm text-fg">{s.title}</p>
              <p className="text-xs text-fg-3">{s.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Code({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-panel">
      <figcaption className="border-b border-line px-4 py-2.5 font-mono text-xs text-fg-3">{label}</figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-[21px] text-fg-2">{children}</pre>
      {note && <p className="border-t border-line px-4 py-2 text-xs text-fg-4">{note}</p>}
    </figure>
  );
}
function Line({ children }: { children: ReactNode }) {
  return <code className="block whitespace-pre-wrap break-words">{children}</code>;
}
const Dim = ({ children }: { children: ReactNode }) => <span className="select-none text-fg-4">{children}</span>;
const K = ({ children }: { children: ReactNode }) => <span className="text-fg">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="text-fg-2">{children}</span>;
const InlineCode = ({ children }: { children: ReactNode }) => (
  <code className="rounded-[4px] border border-line bg-raised px-1 py-px font-mono text-[12.5px] text-fg">{children}</code>
);
