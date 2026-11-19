import type { ReactNode } from "react";
import { absTime, relTime } from "@/lib/format";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-raised px-1 font-mono text-[10px] leading-none text-fg-2">
      {children}
    </kbd>
  );
}

export function Time({ iso, className = "" }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className={`text-fg-4 ${className}`}>never</span>;
  return (
    <time dateTime={iso} title={absTime(iso)} className={`tabular ${className}`}>
      {relTime(iso)}
    </time>
  );
}

export function Sha({ sha, className = "" }: { sha: string | null | undefined; className?: string }) {
  if (!sha) return <span title="No run has recorded a commit yet" className={`text-xs text-fg-4 ${className}`}>no commit</span>;
  return (
    <span title={sha} className={`font-mono text-xs text-fg-2 ${className}`}>
      {sha.slice(0, 7)}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex h-6 items-center justify-between">
      <h2 className="text-2xs font-medium uppercase tracking-[0.08em] text-fg-3">{children}</h2>
      {right}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="whitespace-nowrap rounded-[4px] border border-line bg-raised px-1.5 py-0.5 font-mono text-xs text-fg">{children}</code>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
      {children}
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
        <path d="M6 3.5h6.5V10M12.25 3.75L4 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </a>
  );
}
