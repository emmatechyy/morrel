# Kane CLI NDJSON fixtures

**REAL** = captured from `kane-cli 0.10.6` on 2026-11-19 against https://example.com. Credentials were scrubbed (none appeared). Test Manager project / test-case ids and share tokens were replaced with `PROJECT_ID`, `TEST_CASE_ID`, `SHARE_TOKEN`. **SYNTHETIC** = hand-written from the documented shapes, kept for edge cases with no real capture yet.

| File | Provenance | What it shows |
| --- | --- | --- |
| `real-pass.ndjson` + `.stderr.txt` | **REAL** (via `morrel verify`) | exit 0, `run_end.status:"passed"`, `result_code:100`, `reason_code:"success.complete"`, 13.82 credits |
| `real-fail-stale-heading.ndjson` + `.stderr.txt` | **REAL** (direct `kane-cli run`) | The docs' own example ("heading says Example Domain") now **fails**: example.com no longer renders that heading. exit 1, `result_code:710`, `verdict` (automation_bug / config_issue), `context.memory` with expected vs extracted, 12.46 credits |
| `real-fail-hello-world.ndjson` + `.stderr.txt` | **REAL** (via `morrel verify`) | A false claim. exit 1, `result_code:750`, 12.58 credits. stderr is the tail Morrel keeps |
| `real-unauthenticated.ndjson` + `.stderr.txt` | **REAL** | Not logged in: exit **1** (docs say 2), no `run_end` |
| `synthetic-pass.ndjson` | SYNTHETIC | Documented example stream, plus noise lines and unknown events |
| `synthetic-fail.ndjson` | SYNTHETIC | `warning` (unresolved_variables) + failed step |
| `synthetic-timeout.ndjson` | SYNTHETIC | exit 3, no `run_end` |
| `synthetic-testmd.ndjson` | SYNTHETIC | `testmd` surface ending in `test_md_done`. Step wrapper fields are a best guess |
