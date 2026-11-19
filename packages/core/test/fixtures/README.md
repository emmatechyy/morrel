# Kane CLI NDJSON fixtures

| File | Provenance |
| --- | --- |
| `real-unauthenticated.ndjson` + `.stderr.txt` | **REAL.** Captured 2026-11-19 (twice, identical shape) from `kane-cli 0.10.6` (`kane-cli run "..." --url https://example.com --agent --headless`, not logged in). Exit code was **1** (docs say auth refusals exit 2 — so Morrel keys on the missing completion event, not the exit code). |
| `synthetic-pass.ndjson` | **SYNTHETIC.** Built from the documented example stream in the Kane CLI "Agent Mode" docs and the skill `parsing.md` reference. |
| `synthetic-fail.ndjson` | **SYNTHETIC.** Same shape, with a `failed` step and `run_end.status = "failed"`. |
| `synthetic-timeout.ndjson` | **SYNTHETIC.** Steps then process exit 3 with no `run_end` (documented: cancelled / `--timeout`). |
| `synthetic-testmd.ndjson` | **SYNTHETIC.** `testmd run` surface ending in `test_md_done` (field names from docs: `overall_status`, `duration_s`, `share_url`). Step-wrapper fields are best-effort. |

Replace synthetic fixtures with real captures once Kane credentials are available (`morrel verify` keeps every raw stream under `.morrel/runs/<run_id>.ndjson`).
