#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer({ dbPath: process.env.MORREL_DB || undefined });
await server.connect(new StdioServerTransport());
// stdout carries MCP frames only; diagnostics go to stderr.
process.stderr.write(`morrel-mcp ready (db: ${process.env.MORREL_DB ?? "<repo>/.morrel/morrel.db"})\n`);
