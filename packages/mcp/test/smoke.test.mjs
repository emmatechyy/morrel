// Spawns the built stdio server and drives it with the official MCP client (mock runner, temp DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const parse = (r) => JSON.parse(r.content[0].text);

test("morrel MCP server: create → verify → gate → update → retire", async () => {
  const dir = mkdtempSync(join(tmpdir(), "morrel-mcp-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../dist/index.js", import.meta.url).pathname],
    env: { ...process.env, MORREL_DB: join(dir, "m.db"), MORREL_KANE_MOCK: "1", MORREL_MOCK_FAIL: "cart-*", MORREL_TRUST_MOCK: "" },
    stderr: "pipe",
  });
  const client = new Client({ name: "smoke", version: "0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["memory_create", "memory_get", "memory_list", "memory_retire", "memory_update", "memory_verify"]);

    const created = parse(await client.callTool({ name: "memory_create", arguments: { claim: "Login works", key: "login", objective: "Log in, then verify /dashboard", url: "http://localhost:3000" } }));
    assert.equal(created.status, "unverified");
    assert.equal(created.trusted, false);

    parse(await client.callTool({ name: "memory_create", arguments: { claim: "Cart total", key: "cart-total", objective: "Add item, then verify total", verify: true } }));
    const cart = parse(await client.callTool({ name: "memory_get", arguments: { key: "cart-total" } }));
    assert.equal(cart.status, "failed");
    assert.equal(cart.trusted, false);
    assert.match(cart.warning, /UNTRUSTED/);

    const v = parse(await client.callTool({ name: "memory_verify", arguments: { key: "login" } }));
    assert.equal(v.status, "verified");
    assert.equal(v.run.runner, "mock");
    assert.equal(v.trusted, false, "mock passes are never trusted");

    const u = parse(await client.callTool({ name: "memory_update", arguments: { key: "login", claim: "Login lands on /home", objective: "Log in, then verify /home" } }));
    assert.equal(u.version, 2);
    assert.equal(u.reverified, true);
    assert.equal(u.run.memoryVersion, 2);

    const list = parse(await client.callTool({ name: "memory_list", arguments: {} }));
    assert.equal(list.memories.length, 2);

    const r = parse(await client.callTool({ name: "memory_retire", arguments: { key: "cart-total", reason: "removed" } }));
    assert.equal(r.status, "retired");

    const missing = await client.callTool({ name: "memory_get", arguments: { key: "nope" } });
    assert.equal(missing.isError, true);
  } finally {
    await client.close();
  }
});
