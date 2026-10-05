# oracle/ — the PHI value-engine (jarvis-phi-oracle Unit 2)

The Oracle-resident wrapper that lets a Claude session touch Sebastian's own book
**without any raw lead value entering Anthropic/LLM context.** It runs a registered
query on Oracle, sends every byte of raw output to an Oracle-local file Claude never
reads, and returns only counts / schema / a de-id'd sample on stdout.

## Files

- `phi-value-engine` — the CLI. `run --query NAME [--arg k=v] [--sample N] [--redact]`.
- `phi_deid.py` — the de-id gate. Detector patterns ported from `phi-guard`.
- `queries.json` — the query registry. **Ships PARKED** (`scope_sql: null`).
- `test_phi_value_engine.py` — 12 tests; the key one proves values never hit stdout.

## Two enforcement layers (both must hold — fail closed if either is absent)

1. **Structural** — the query is a subprocess with stdout+stderr → an out-file
   (mode 600) on Oracle disk. The engine captures none of it; there is no path by
   which raw rows return through stdout.
2. **De-id gate** — any emitted sample runs through `phi_deid` first. Default is
   drop-on-doubt (a not-provably-clean line is discarded, not masked).

## Fail-closed refusals (distinct exit codes)

| code | meaning |
|------|---------|
| 3 | unknown query — only registry-declared queries run; no freeform SQL |
| 4 | host guard — not on the designated PHI host (Oracle) |
| 5 | query missing the `{{SEB_SCOPE}}` token — could touch non-Sebastian rows |
| 6 | scope token present but `scope_sql` not wired — the Oracle-schema gate |
| 2 | engine error — nothing leaks to stdout |

## GATED on Oracle (do NOT guess the schema)

The one inference this unit refuses to make is the lead-table column name. When Oracle
is reachable:

1. Deploy — from the **Mini** (use whichever IP answers):
   `rsync -av ~/Code/jarvis-surface/oracle/ sebastian-gerhardt@100.116.88.21:~/jarvis-phi/`
2. On **Oracle**, confirm the real schema:
   `sqlite3 ~/deborah-brain/mirror/mirror.db '.schema contacts'`  (verify the table +
   the `assignedTo` column; memory `reference-my-leads-filter-ghl` says his id is
   `z64lpL3Vfx3o8hlEHF7v`, ~1,069 rows).
3. Edit `~/jarvis-phi/queries.json`: set `scope_sql` to the exact clause
   (e.g. `assignedTo='z64lpL3Vfx3o8hlEHF7v'`) and give each query a real `cmd`
   containing `{{SEB_SCOPE}}`.
4. Verify: `python3 ~/jarvis-phi/test_phi_value_engine.py` then a real
   `phi-value-engine run --query my-leads-count` — the count returns, the rows do not.

Unit 3 (the result-page writer) consumes the `out_file` this produces.

## Unit 3 — `phi-result-page` (the result-page writer)

The other end of the Unit 2 boundary. Where the engine confines raw rows to an
Oracle-local out-file Claude never reads, this consumes that out-file and renders the
thing Deborah's text links to — a result page **with the full values in it** — then
hands back **only the URL**.

- `phi-result-page render --out-file PATH [--query NAME] [--title ...] [--columns a,b]`
- Reads the engine out-file, renders an HTML table (every cell `html.escape`'d), writes
  it to `results_dir/<query>-<ts>.html` (mode 600), prints `{ok, url, rows, out_html,
  host, served}` — **never the HTML, never a value** — to stdout.
- Same host guard (exit 4) and fail-closed error (exit 2) posture as the engine; shares
  `load_config` / `Refuse` / `assert_phi_host` from `phi-value-engine` (loaded by path).
- `test_phi_result_page.py` — 10 tests; the load-bearing one proves a name+phone land
  in the written HTML and appear nowhere on stdout.

### Serving is PARKED like `scope_sql`

If `results_base_url` is null in `queries.json`, the page is still written to disk and a
`file://` path is returned with `served=false`. When serving is set up on Oracle (a
`tailscale serve` root fronting `results_dir`), set `results_base_url` to that root and
the script returns a real tailnet URL with `served=true`. Do NOT guess the serve URL.
