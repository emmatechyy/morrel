import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col justify-center px-6">
      <p className="font-mono text-xs text-fg-3">404</p>
      <h1 className="mt-2 text-[20px] font-semibold">No such memory</h1>
      <p className="mt-2 text-sm text-fg-3">It may have been created in a different database. The board reads <code className="font-mono text-fg-2">$MORREL_DB</code> or <code className="font-mono text-fg-2">.morrel/morrel.db</code> at the repo root.</p>
      <Link href="/board" className="mt-6 text-sm text-link hover:underline">Back to memories</Link>
    </main>
  );
}
