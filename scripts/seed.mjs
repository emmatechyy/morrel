#!/usr/bin/env node
/**
 * Seeds a DEMO database for a fictional storefront ("Acme Shop", http://localhost:3000).
 * Every run here is produced by the MOCK pipeline: synthetic NDJSON in Kane's documented shape,
 * parsed by the real parser, recorded with runner = "mock". The board labels them MOCK and the
 * read gate never trusts them. Use `morrel verify` with real Kane credentials for real runs.
 *
 *   pnpm seed            # writes ./.morrel/morrel.db (or $MORREL_DB), replacing it
 */
import { rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { MorrelStore, parseKaneOutput, resolveDbPath, runsDir, newId } from "../packages/core/dist/index.js";

const dbPath = resolveDbPath();
for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) if (existsSync(f)) rmSync(f);
rmSync(runsDir(dbPath), { recursive: true, force: true });
mkdirSync(runsDir(dbPath), { recursive: true });
const store = MorrelStore.open(dbPath);
const db = store.db;

const H = 3600_000;
const NOW = Date.now();
const at = (hoursAgo) => new Date(NOW - hoursAgo * H).toISOString();
const sha = () => randomBytes(20).toString("hex");
// Fake commit history, oldest first.
const C = { c1: sha(), c2: sha(), c3: sha(), c4: sha(), c5: sha() };

function backdateLatestEvent(memoryId, iso) {
  db.prepare("UPDATE memory_events SET created_at = ? WHERE id = (SELECT MAX(id) FROM memory_events WHERE memory_id = ?)").run(iso, memoryId);
}

function create(key, claim, objective, opts = {}) {
  const m = store.createMemory({ key, claim, flow: { objective, url: opts.url ?? "http://localhost:3000" + (opts.path ?? "") }, tags: opts.tags ?? [], gitSha: opts.sha ?? C.c1 });
  const t = at(opts.createdHoursAgo ?? 70);
  db.prepare("UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?").run(t, t, m.id);
  backdateLatestEvent(m.id, t);
  return m;
}

/** Writes a synthetic (MOCK) Kane NDJSON stream and records it. */
function run(m, hoursAgo, commit, steps, outcome, extra = {}) {
  const end = NOW - hoursAgo * H;
  const stepMs = 2600;
  let t = end - (steps.length + 2) * stepMs;
  const ts = () => new Date((t += stepMs - 400 + Math.floor(Math.random() * 800))).toISOString();
  const lines = [{ type: "stream_start", cli_version: "mock", surface: "run", pid: 0, mock: true, v: 1, ts: ts() }];
  if (outcome === "error") {
    lines.push({ type: "error", message: extra.reason ?? "MOCK: simulated refusal", v: 1, ts: ts() });
  } else {
    let n = 1;
    for (const [status, remark] of steps) {
      n++;
      lines.push({ step: n, status: "running", remark: `Step ${n - 1}`, v: 1, ts: ts() });
      lines.push({ step: n, status, remark, v: 1, ts: ts() });
      if (status === "failed") break;
    }
    const passed = outcome === "pass";
    lines.push({
      type: "run_end",
      status: passed ? "passed" : "failed",
      summary: extra.summary ?? (passed ? `Verified: ${steps[steps.length - 1][1].replace(/^\w+: /, "")}` : "Assertion failed"),
      one_liner: extra.oneLiner,
      reason: passed ? "Objective completed" : "Assertion failed",
      duration: Math.round((t - (end - (steps.length + 2) * stepMs)) / 100) / 10,
      credits_consumed: 0,
      final_state: extra.finalState,
      mock: true,
      v: 1,
      ts: ts(),
    });
  }
  const stdout = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const id = newId("run");
  const rawPath = join(runsDir(dbPath), `${id}.ndjson`);
  writeFileSync(rawPath, stdout);
  const exit = outcome === "pass" ? 0 : outcome === "fail" ? 1 : 2;
  const parsed = parseKaneOutput(stdout, exit, extra.stderr ?? "", { mock: true });
  parsed.evidence.mock = true;
  const finishedAt = new Date(end).toISOString();
  const startedAt = new Date(end - (parsed.durationMs ?? 8000)).toISOString();
  store.recordRun({
    id, memoryId: m.id, runner: "mock", startedAt, finishedAt, result: parsed.result, exitCode: exit,
    durationMs: parsed.durationMs ?? 900, summary: parsed.summary, reason: parsed.reason, gitSha: commit,
    command: `[mock] kane-cli run ${JSON.stringify(store.requireMemory(m.id).flow.objective)} --agent --headless --url ${store.requireMemory(m.id).flow.url}`,
    evidence: parsed.evidence, rawNdjsonPath: rawPath,
  });
}

function staleFor(commit, hoursAgo) {
  const staled = store.markStaleForSha(commit);
  for (const m of staled) {
    db.prepare("UPDATE memories SET updated_at = ? WHERE id = ?").run(at(hoursAgo), m.id);
    backdateLatestEvent(m.id, at(hoursAgo));
  }
}

// ---------- memories ----------
const login = create("auth-login-redirect", "Signing in with valid credentials lands on /dashboard",
  "Go to /login, type demo@acme.dev into Email and {{password}} into Password, click Sign in, then verify the URL is /dashboard and the header greets 'Demo'",
  { path: "/login", tags: ["auth"], createdHoursAgo: 72 });
const LOGIN = [
  ["done", "navigate: Navigate to http://localhost:3000/login"],
  ["done", "type: Typed demo@acme.dev into Email"],
  ["done", "type: Typed •••••••• into Password"],
  ["done", "click: Clicked 'Sign in'"],
  ["done", "assert: URL is http://localhost:3000/dashboard"],
  ["done", "assert: Header shows 'Welcome back, Demo'"],
];

const badPw = create("auth-invalid-password", "A wrong password shows 'Invalid email or password' and stays on /login",
  "Go to /login, sign in as demo@acme.dev with password 'wrong-password', then verify the error 'Invalid email or password' is shown and the URL is still /login",
  { path: "/login", tags: ["auth"], createdHoursAgo: 72 });
const BADPW = [
  ["done", "navigate: Navigate to http://localhost:3000/login"],
  ["done", "type: Typed demo@acme.dev into Email"],
  ["done", "type: Typed wrong-password into Password"],
  ["done", "click: Clicked 'Sign in'"],
  ["done", "assert: Alert reads 'Invalid email or password'"],
  ["done", "assert: URL is still http://localhost:3000/login"],
];

const badge = create("cart-add-updates-badge", "Adding a product to the cart increments the cart badge",
  "Open /products/aero-mug, click 'Add to cart', then verify the cart badge in the header shows 1",
  { path: "/products/aero-mug", tags: ["cart"], createdHoursAgo: 60 });
const BADGE = [
  ["done", "navigate: Navigate to http://localhost:3000/products/aero-mug"],
  ["done", "click: Clicked 'Add to cart'"],
  ["done", "assert: Cart badge shows 1"],
];

const save10 = create("checkout-save10-discount", "Coupon SAVE10 takes 10% off the subtotal at checkout",
  "Add the Aero Mug ($50.00) to the cart, go to /checkout, apply coupon SAVE10, store the order total as 'total', then verify the total is $45.00",
  { path: "/products/aero-mug", tags: ["checkout", "pricing"], createdHoursAgo: 58 });
const SAVE10_OK = [
  ["done", "navigate: Navigate to http://localhost:3000/products/aero-mug"],
  ["done", "click: Clicked 'Add to cart'"],
  ["done", "navigate: Navigate to http://localhost:3000/checkout"],
  ["done", "type: Typed SAVE10 into 'Discount code'"],
  ["done", "click: Clicked 'Apply'"],
  ["done", "extract: Stored order total as 'total' = $45.00"],
  ["done", "assert: Order total is $45.00"],
];
const SAVE10_FAIL = [
  ...SAVE10_OK.slice(0, 5),
  ["done", "extract: Stored order total as 'total' = $50.00"],
  ["failed", "assert: Expected order total $45.00 but the page shows $50.00; discount row reads 'SAVE10 — code expired'"],
];

const ship = create("checkout-free-shipping", "Orders over $50 qualify for free shipping",
  "Add two Aero Mugs to the cart, open /cart, then verify the shipping line reads 'Free' and the progress bar says 'You've unlocked free shipping'",
  { path: "/products/aero-mug", tags: ["checkout"], createdHoursAgo: 50 });
const SHIP = [
  ["done", "navigate: Navigate to http://localhost:3000/products/aero-mug"],
  ["done", "click: Set quantity to 2 and clicked 'Add to cart'"],
  ["done", "navigate: Navigate to http://localhost:3000/cart"],
  ["done", "assert: Shipping line reads 'Free'"],
  ["done", "assert: Banner says 'You've unlocked free shipping'"],
];

const search = create("search-empty-state", "Searching a nonsense term shows the 'No products found' empty state",
  "Type 'zzqxv' into the header search, press Enter, then verify the results page shows 'No products found' and a 'Clear search' button",
  { tags: ["search"], createdHoursAgo: 48 });
const SEARCH = [
  ["done", "navigate: Navigate to http://localhost:3000"],
  ["done", "type: Typed zzqxv into header search and pressed Enter"],
  ["done", "assert: Heading reads 'No products found'"],
  ["done", "assert: 'Clear search' button is visible"],
];

const pricing = create("pricing-annual-discount", "The annual toggle on /pricing shows '2 months free'",
  "Open /pricing, switch the billing toggle to Annual, then verify each paid plan shows '2 months free'",
  { path: "/pricing", tags: ["pricing"], createdHoursAgo: 40 });
const PRICING = [
  ["done", "navigate: Navigate to http://localhost:3000/pricing"],
  ["done", "click: Switched billing toggle to 'Annual'"],
  ["done", "assert: Pro and Team plans show '2 months free'"],
];

const theme = create("settings-theme-persists", "Theme preference persists after a page reload",
  "Sign in as demo@acme.dev, open /settings, choose the Light theme, reload the page, then verify Light is still selected and the page background is light",
  { path: "/settings", tags: ["settings"], createdHoursAgo: 36 });
const THEME_FAIL = [
  ["done", "navigate: Navigate to http://localhost:3000/settings"],
  ["done", "click: Selected 'Light' in Theme"],
  ["done", "navigate: Reloaded the page"],
  ["failed", "assert: Expected 'Light' selected after reload; 'System' is selected and background is #0b0b0b"],
];

const onboarding = create("onboarding-skip", "New users can skip onboarding from the first step",
  "Sign up as a new user, then on the onboarding step 1 click 'Skip for now' and verify the URL is /dashboard",
  { path: "/signup", tags: ["onboarding"], createdHoursAgo: 30 });
const ONBOARD = [
  ["done", "navigate: Navigate to http://localhost:3000/signup"],
  ["done", "type: Filled sign-up form with a generated email"],
  ["done", "click: Clicked 'Create account'"],
  ["done", "click: Clicked 'Skip for now' on step 1 of 4"],
  ["done", "assert: URL is http://localhost:3000/dashboard"],
];

const reset = create("password-reset-confirmation", "Requesting a password reset shows a 'Check your email' confirmation",
  "Go to /forgot-password, submit demo@acme.dev, then verify the page says 'Check your email'",
  { path: "/forgot-password", tags: ["auth"], createdHoursAgo: 6 });

const del = create("account-delete-requires-confirm", "Deleting an account requires typing DELETE to confirm",
  "Sign in as demo@acme.dev, open /settings/account, click 'Delete account', then verify the Delete button stays disabled until 'DELETE' is typed",
  { path: "/settings/account", tags: ["settings"], createdHoursAgo: 2 });

const guest = create("guest-checkout-available", "Guest checkout is available without creating an account",
  "Add any product to the cart, go to /checkout while signed out, then verify a 'Continue as guest' option is shown",
  { path: "/checkout", tags: ["checkout"], createdHoursAgo: 70 });

// ---------- timeline ----------
// c1 (~66h ago): first verification sweep
for (const [m, s] of [[login, LOGIN], [badPw, BADPW], [guest, [["done", "navigate: Navigate to http://localhost:3000/products/aero-mug"], ["done", "click: Clicked 'Add to cart'"], ["done", "navigate: Navigate to http://localhost:3000/checkout"], ["done", "assert: 'Continue as guest' is visible"]]]]) run(m, 66, C.c1, s, "pass");
run(badge, 58, C.c1, BADGE, "pass");
run(save10, 57, C.c1, SAVE10_OK, "pass", { finalState: { total: "$45.00" }, summary: "Applied SAVE10 and confirmed the total is $45.00" });

// c2 (~48h): commit → stale sweep → re-verify
staleFor(C.c2, 48);
for (const [m, s] of [[login, LOGIN], [badPw, BADPW], [badge, BADGE], [save10, SAVE10_OK], [ship, SHIP], [search, SEARCH], [guest, [["done", "navigate: Navigate to http://localhost:3000/products/aero-mug"], ["done", "click: Clicked 'Add to cart'"], ["done", "navigate: Navigate to http://localhost:3000/checkout"], ["done", "assert: 'Continue as guest' is visible"]]]]) {
  run(m, 47.5, C.c2, s, "pass", m === save10 ? { finalState: { total: "$45.00" } } : {});
}
// Guest checkout removed by product decision → agent retires the memory.
store.retireMemory(guest.id, "Guest checkout removed in favour of passkey sign-up (PR #212)", C.c2);
backdateLatestEvent(guest.id, at(44));
db.prepare("UPDATE memories SET retired_at = ?, updated_at = ? WHERE id = ?").run(at(44), at(44), guest.id);

// c3 (~30h): pricing + theme + onboarding added and verified
staleFor(C.c3, 30);
run(pricing, 29.5, C.c3, PRICING, "pass");
run(onboarding, 29, C.c3, ONBOARD, "pass");
for (const [m, s] of [[login, LOGIN], [badPw, BADPW], [badge, BADGE], [search, SEARCH], [ship, SHIP]]) run(m, 28.8, C.c3, s, "pass");
run(save10, 28.7, C.c3, SAVE10_OK, "pass", { finalState: { total: "$45.00" } });

// Agent rewrote the pricing claim (copy changed to "Save 20%") → v2, stale, awaiting re-verify.
store.updateMemory(pricing.id, {
  claim: "The annual toggle on /pricing shows 'Save 20%' on every paid plan",
  flow: { objective: "Open /pricing, switch the billing toggle to Annual, then verify the Pro and Team plans each show a 'Save 20%' badge" },
  gitSha: C.c4,
});
backdateLatestEvent(pricing.id, at(20));
db.prepare("UPDATE memories SET updated_at = ? WHERE id = ?").run(at(20), pricing.id);

// c4 (~9h): checkout refactor. Sweep: SAVE10 now fails; theme fails; others pass.
staleFor(C.c4, 9);
for (const [m, s] of [[login, LOGIN], [badPw, BADPW], [badge, BADGE], [search, SEARCH], [onboarding, ONBOARD]]) run(m, 8.7, C.c4, s, "pass");
run(save10, 8.6, C.c4, SAVE10_FAIL, "fail", { summary: "SAVE10 was rejected as expired; total stayed at $50.00", finalState: { total: "$50.00" } });
run(theme, 8.5, C.c4, THEME_FAIL, "fail", { summary: "Theme reverted to System after reload" });
run(ship, 8.4, C.c4, SHIP, "pass");

// Password reset: first attempt could not start (simulated refusal, no run_end) → stays unverified.
run(reset, 5.5, C.c4, [], "error", { reason: "Not authenticated. Run: kane-cli login --oauth, or kane-cli login --username <user> --access-key <key>", stderr: "MOCK: Not authenticated." });

// c5 (~1h): new commit landed; post-commit hook marked everything verified as stale. Partial re-verify so far.
staleFor(C.c5, 1.2);
run(login, 1.0, C.c5, LOGIN, "pass");
run(badPw, 0.95, C.c5, BADPW, "pass");
run(search, 0.9, C.c5, SEARCH, "pass");
run(badge, 0.6, C.c5, BADGE, "pass");

store.setMeta("seed", JSON.stringify({ app: "Acme Shop (fictional)", at: new Date().toISOString(), mock: true }));
const c = store.counts();
console.log(`seeded ${dbPath}`);
console.log(`  ${c.total} active + ${c.retired} retired · verified ${c.verified} · failed ${c.failed} · stale ${c.stale} · unverified ${c.unverified}`);
console.log("  all runs are MOCK (synthetic) — none are trusted by the read gate");
store.close();
