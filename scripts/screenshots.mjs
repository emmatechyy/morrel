#!/usr/bin/env node
// Captures the status board with headless Chrome. Usage: node scripts/screenshots.mjs [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = new URL("../docs/screenshots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const shots = [
  ["board", "/"],
  ["board-failed", "/?status=failed"],
  ["detail-failed", "/memories/checkout-save10-discount"],
  ["detail-verified", "/memories/auth-login-redirect"],
  ["detail-stale-rewritten", "/memories/pricing-annual-discount"],
  ["runs", "/runs"],
];
for (const [name, path] of process.env.ONLY_REAL ? [] : shots) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "header{position:relative!important}" });
  if (name === "detail-failed") {
    await page.click("summary");
  }
  await page.screenshot({ path: `${out}${name}.png`, fullPage: name.startsWith("detail") });
  console.log(`${out}${name}.png`);
}
if (process.env.EMPTY_URL) {
  await page.goto(process.env.EMPTY_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}board-empty.png` });
  console.log(`${out}board-empty.png`);
}
if (process.env.REAL_URL) {
  // Board pointed at the real-Kane database (MORREL_DB=.morrel/real/morrel.db).
  for (const [name, path, full] of [
    ["real-board", "/", false],
    ["real-detail-trusted", "/memories/example-heading", true],
    ["real-detail-stale-heading-run", null, true],
    ["real-detail-failed", "/memories/example-hello-world", true],
  ]) {
    let url = process.env.REAL_URL + (path ?? "");
    if (name === "real-detail-stale-heading-run") {
      await page.goto(process.env.REAL_URL + "/memories/example-heading", { waitUntil: "networkidle" });
      const href = await page.locator('a[href*="?run="]').last().getAttribute("href");
      url = process.env.REAL_URL + href;
    }
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "header{position:relative!important}" });
    await page.screenshot({ path: `${out}${name}.png`, fullPage: full });
    console.log(`${out}${name}.png`);
  }
}
if (process.env.DEMO_URL) {
  for (const [name, path, full] of [["demo-board", "/", false], ["demo-detail-trusted", "/memories/example-heading", true]]) {
    await page.goto(process.env.DEMO_URL + path, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "header{position:relative!important}" });
    await page.screenshot({ path: `${out}${name}.png`, fullPage: full });
    console.log(`${out}${name}.png`);
  }
}
await browser.close();
