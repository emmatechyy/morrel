"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Global keyboard shortcuts: / search, j/k move, enter open, g m / g r navigate, 1-6 status filters. */
export function Shortcuts({ filters = [] as string[] }: { filters?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    let g = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>("[data-row]"));
    const move = (d: number) => {
      const list = rows();
      if (!list.length) return;
      const i = list.findIndex((r) => r.dataset.active === "true");
      const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))]!;
      list.forEach((r) => (r.dataset.active = "false"));
      next.dataset.active = "true";
      next.scrollIntoView({ block: "nearest" });
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("#search")?.focus();
      } else if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter") {
        const a = rows().find((r) => r.dataset.active === "true");
        const href = a?.dataset.href;
        if (href) router.push(href);
      } else if (e.key === "Escape" && pathname !== "/board") {
        router.push("/board");
      } else if (g && e.key === "m") {
        router.push("/board");
      } else if (g && e.key === "r") {
        router.push("/runs");
      } else if (e.key === "g") {
        g = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (g = false), 800);
        return;
      } else if (/^[1-9]$/.test(e.key) && filters.length) {
        const f = filters[Number(e.key) - 1];
        if (f === undefined) return;
        const p = new URLSearchParams(params.toString());
        if (f === "all") p.delete("status");
        else p.set("status", f);
        router.push(`${pathname}?${p.toString()}`);
      }
      g = false;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, params, pathname, filters]);
  return null;
}

export function SearchBox({ placeholder = "Search memories" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <label className="group relative flex h-7 w-64 items-center">
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2 size-3.5 text-fg-3" aria-hidden>
        <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.25 10.25L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        id="search"
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const p = new URLSearchParams(params.toString());
            if (v) p.set("q", v);
            else p.delete("q");
            start(() => router.replace(`${pathname}?${p.toString()}`));
          }, 150);
        }}
        placeholder={placeholder}
        className="h-7 w-full rounded-md border border-line bg-panel pl-7 pr-8 text-sm text-fg placeholder:text-fg-4 hover:border-line-strong focus:border-fg-4 focus:outline-none"
      />
      <span className="pointer-events-none absolute right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-raised px-1 font-mono text-[10px] text-fg-3 group-focus-within:hidden">
        /
      </span>
    </label>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="h-6 shrink-0 rounded-[5px] border border-line px-2 text-2xs text-fg-2 hover:border-line-strong hover:text-fg"
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Live-ish board: re-fetch server data every N seconds so CLI/hook runs show up. */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
