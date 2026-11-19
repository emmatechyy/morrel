import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOK_MARKER = "# >>> morrel managed hook >>>";
const HOOK_END = "# <<< morrel managed hook <<<";

export function hookScript(kind: "post-commit" | "pre-push"): string {
  const cli = fileURLToPath(new URL("./index.js", import.meta.url));
  const node = process.execPath;
  const run = `if command -v morrel >/dev/null 2>&1; then MORREL="morrel"; else MORREL="\\"${node}\\" \\"${cli}\\""; fi`;
  const body =
    kind === "post-commit"
      ? // Never block a commit: re-verify in the background, log to .morrel/hook.log.
        `${run}\nmkdir -p .morrel\neval "$MORREL mark-stale" >/dev/null 2>&1\n( eval "$MORREL verify --all --quiet" >> .morrel/hook.log 2>&1 & )\necho "morrel: memories marked stale for $(git rev-parse --short HEAD); re-verifying in background (.morrel/hook.log)"`
      : // pre-push: block the push if any memory is untrusted after re-verification.
        `${run}\neval "$MORREL verify --all" || { echo "morrel: push blocked — some memories are failed/stale. Fix, update or retire them (morrel list)." >&2; exit 1; }`;
  return `${HOOK_MARKER}\n${body}\n${HOOK_END}\n`;
}

export function installHook(gitDir: string, kind: "post-commit" | "pre-push"): { path: string; replaced: boolean } {
  const dir = join(gitDir, "hooks");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, kind);
  let existing = existsSync(path) ? readFileSync(path, "utf8") : "#!/bin/sh\n";
  const replaced = existing.includes(HOOK_MARKER);
  if (replaced) {
    existing = existing.replace(new RegExp(`${HOOK_MARKER}[\\s\\S]*?${HOOK_END}\\n?`), "");
  }
  if (!existing.endsWith("\n")) existing += "\n";
  writeFileSync(path, existing + hookScript(kind));
  chmodSync(path, 0o755);
  return { path, replaced };
}
