# @morrel/mcp — next milestone

Not built yet. Planned: a stdio MCP server exposing the same `@morrel/core` API so coding agents
(Claude Code, Cursor, Codex) can use Morrel without shelling out:

| Tool | Maps to |
| --- | --- |
| `memory_create` | `MorrelStore.createMemory` (claim + Kane objective / test file) |
| `memory_get` | `MorrelStore.getMemory` — returns `{ status, trusted, warning }`; agents must not act on `trusted: false` |
| `memory_list` | `MorrelStore.listGated` |
| `memory_update` | `updateMemory` → `verifyMemory` (close the loop) |
| `memory_retire` | `retireMemory` |
| `memory_verify` | `verifyMemory` / `verifyAll` |

Until then, agents use the CLI with `--json` (`morrel get <key> --json --strict`).
