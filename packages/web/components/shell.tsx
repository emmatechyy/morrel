import Link from "next/link";
import type { ReactNode } from "react";
import { Kbd } from "./ui";

export function TopBar({ active, dbPath, mock }: { active: "memories" | "runs"; dbPath: string; mock: boolean }) {
  const tab = (href: string, label: string, key: string, on: boolean) => (
    <Link
      href={href}
      className={`flex h-11 items-center gap-2 border-b px-0.5 text-sm transition-colors ${
        on ? "border-fg text-fg" : "border-transparent text-fg-3 hover:text-fg-2"
      }`}
    >
      {label}
      <span className="hidden items-center gap-0.5 lg:flex">
        <Kbd>g</Kbd>
        <Kbd>{key}</Kbd>
      </span>
    </Link>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-11 max-w-[1400px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2 text-fg">
          <Logo />
          <span className="font-mono text-[13px] font-semibold tracking-tight">morrel</span>
        </Link>
        <span className="h-4 w-px bg-line-strong" />
        <nav className="flex items-center gap-5">
          {tab("/", "Memories", "m", active === "memories")}
          {tab("/runs", "Runs", "r", active === "runs")}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3 text-2xs text-fg-3">
          {mock && (
            <span className="rounded-[4px] border border-dashed border-fg-4 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-fg-2">
              MOCK RUNNER ACTIVE
            </span>
          )}
          <span className="hidden truncate font-mono md:inline" title={dbPath}>
            {dbPath.replace(process.env.HOME ?? "~", "~")}
          </span>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  // A gate: two posts and a lintel. Memories pass only when the flow holds.
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 11.5V6.5h6v5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M8 6.5v5" stroke="#3fb950" strokeWidth="1.25" />
    </svg>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[1400px] px-6 pb-24">{children}</main>;
}
