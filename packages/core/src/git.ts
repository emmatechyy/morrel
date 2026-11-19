import { execFileSync } from "node:child_process";

/**
 * The commit memories are verified against. By default HEAD. When `MORREL_APP_DIR` is set
 * (app under test lives in a subdirectory of a monorepo), the last commit that touched that
 * directory, so unrelated commits elsewhere in the repo do not mark memories stale.
 */
export function currentGitSha(cwd: string = process.cwd(), appDir: string | undefined = process.env.MORREL_APP_DIR): string | null {
  const args = appDir ? ["log", "-1", "--format=%H", "--", appDir] : ["rev-parse", "HEAD"];
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

export function gitRoot(cwd: string = process.cwd()): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}
