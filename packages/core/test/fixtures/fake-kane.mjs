#!/usr/bin/env node
// Test double for kane-cli: replays a fixture to stdout, writes FAKE_KANE_STDERR to stderr, exits FAKE_KANE_EXIT.
import { readFileSync, writeFileSync } from "node:fs";
if (process.env.FAKE_KANE_ARGV) writeFileSync(process.env.FAKE_KANE_ARGV, JSON.stringify(process.argv.slice(2)));
process.stdout.write(readFileSync(process.env.FAKE_KANE_FIXTURE, "utf8"));
if (process.env.FAKE_KANE_STDERR) process.stderr.write(process.env.FAKE_KANE_STDERR);
process.exitCode = Number(process.env.FAKE_KANE_EXIT ?? 0);
