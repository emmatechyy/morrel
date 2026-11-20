import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/shell";

export const metadata = {
  title: "Morrel — verified memory for coding agents",
  description: "Morrel links every memory a coding agent keeps about your app to a Kane CLI flow, and only trusts it while the flow passes.",
};

const REPO = "https://github.com/emmatechyy/morrel";

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
