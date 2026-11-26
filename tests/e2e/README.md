# End-to-end suite

Single-session Playwright suite for the dashboard. Every worker boots the app once and navigates
by deep link; it runs against the **built** app (`dist/`), served by `vite preview`, not the dev
server.

```bash
pnpm e2e          # build check -> seed -> run everything -> write artifacts/e2e/report.html
pnpm e2e:smoke    # the six @smoke cases only
pnpm e2e:seed     # just build/verify the test database (idempotent, ~150ms)
pnpm e2e:report   # open the report
```

That is the whole interface: no flags, no tuning. Prerequisites are a GreptimeDB on
`http://127.0.0.1:4000` and a current `dist/` (`pnpm e2e` tells you to run `pnpm build` if it is
stale, and refuses to test a build served from somewhere else).

## Scope: common flows only

The suite covers the paths a user actually walks — open a page, run a query, filter, drill down,
create/delete an object — and deliberately does **not** test error injection (invalid SQL, missing
tables, malformed line protocol). Those belong in unit/API tests: they are cheap there and only add
noise and blank end-state screenshots here.

## What the assertions may look at

This is the rule review should enforce. An assertion may use:

1. **what the user can see** — a count the page reports (`.results-count`), a cell's text, a
   chart's ink (`expectChartDrawn`);
2. **what the database really holds** — `dbTotal(...)`, computed independently of the page;
3. **URL state** — the hash, for deep-link/selection wiring.

The SQL the page sends is a **synchronisation point only** (`waitSql` / `waitProm`). Restyling the
query builder must not fail a test; rendering the wrong rows must. If you need to pin down the
generated SQL itself, unit-test it under `src/**/*.test.ts` (`pnpm test`) instead.

Two practical consequences, both measured:

- the grids are virtualised — 60 rows produce ~13 DOM rows, so `toHaveCount(60)` is wrong; use
  `.results-count`;
- "a canvas exists" is not evidence — an empty result renders no canvas at all, and a chart that
  lost its series still has axes. `expectChartDrawn` counts painted pixels.

## Environment

Nothing needs to be set for `pnpm e2e`. The variables below exist for other setups (CI, a release
artifact, a different database) and all have working defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_DB` | `dashboard_e2e` | Writable database. **Dropped and rebuilt** when the dataset changes; must contain an `e2e` segment and must not be a system database. |
| `E2E_EXPLORE_DB` | `public` | Read-only database for Explore/Drilldown and the trace fixtures. |
| `E2E_DB_HTTP` | `http://127.0.0.1:4000` | GreptimeDB for seeding/read-backs; also drives the preview `/v1` proxy. A non-loopback host requires `E2E_REMOTE=1`. |
| `E2E_DB_USER` / `E2E_DB_PASSWORD` / `E2E_DB_AUTH_HEADER` | empty | Auth for `/v1` (legacy `SMOKE_DB_*` names also work). |
| `E2E_DIST_DIR` | `dist` | Build under test; skips the "dist older than src" check (used by `pnpm e2e:release`). |
| `E2E_HOST` / `E2E_PORT` | `127.0.0.1` / `4173` | Where the preview server is expected. |
| `E2E_TRACES_TABLE` / `E2E_TRACES_LOGS_TABLE` / `E2E_TRACES_WINDOW_*` | `opentelemetry_traces_v2` / `opentelemetry_logs` / Nov 4 2026 | OTel data used by `06`/`10`; those tests skip when the window is empty (the skip reason is printed). |

Two guards run before any SQL: a rejected `E2E_DB`/remote host, and a served build that is not the
one in `dist/` (a warm preview server from another checkout would otherwise be tested silently).

## Dataset

`tests/e2e/data/dataset.ts` is pure: it generates the SQL and the exact `EXPECT` numbers, and
`datasetVersion()` hashes the statements. Changing anything there re-seeds the database on the next
run. Seeded rows live in a fixed hour (2026-09-19T12:00Z) so absolute windows stay deterministic;
the newest log row deliberately contains quotes, `&`, `<b>` and an emoji.

Data that is not seeded (`TRACES_*`, the `EXPLORE` logs window) belongs to `EXPLORE_DB`; the tests
that need it skip, and the reporter prints every skip reason in the summary line and the header.
Skips are printed in the summary and the report header, so a run where the trace fixtures were missing cannot look silently complete.

## Verifying a published release

```bash
pnpm e2e:release            # latest release (resolved from the releases/latest redirect)
pnpm e2e:release v0.14.7    # a specific tag
```

Downloads the release's `build.tar.gz` (the HTML bundle the workflow publishes), verifies its
`sha256.txt`, extracts it under `artifacts/release-verify/<tag>/` and runs the `@smoke` subset
against it as `dist/` — no build, no token, no flags. The run writes its own report to
`artifacts/release-verify/<tag>/report.html`; delete that directory to download again.

Only `@smoke` runs: the full suite asserts behaviour added after a given release, while these six
cases answer "does this build still open and talk to GreptimeDB". Measured on v0.14.7: 6 passed,
~20s.

## Known limitation: self-hosting the trace fixtures

`06`/`10` read OpenTelemetry spans from `EXPLORE_DB` (default `public`), which is why they skip when
that window is empty. Pointing them at seeded data was attempted and blocked: the service map reads
`greptime_private.semantic_entities` / `semantic_relationships`, which the server derives **at
ingestion** from the trace data model. A plain `INSERT` into a table created with
`table_data_model='greptime_trace_v2'` renders the trace pages fine (gantt, attributes, service
nodes) but yields `0 calls`, so the service-map assertion cannot pass. A follow-up would seed through
the OTLP write path (`/v1/otlp/v1/traces`) and let the server build the semantic layer.

Also note the trace window is an absolute date (Nov 4 2026): once that data ages out of retention,
those nine tests skip and the summary line says why.

## Proving the suite can fail

```bash
node scripts/e2e-mutation-check.mjs          # 6 seeded defects, ~6 min
node scripts/e2e-mutation-check.mjs --list
```

Each mutation breaks one product behaviour, rebuilds, and runs the spec that should catch it. A
green run there means the assertion is decorative. The report is written to
`artifacts/e2e/mutation.md`; wire it into a nightly job, not PR CI.

## Reports

`artifacts/e2e/report.html` — one self-contained file with every test's screenshot, skip reasons
and notes. Treat it as internal: it embeds screenshots of the data under test. On failure Playwright
also keeps a trace (`trace: 'retain-on-failure'`).

Screenshot conventions:

- **one image per test**, captioned `final state — <route>` (or `failure state — <route>`), so the
  report has a 1:1 map between cards and pictures and a mostly-empty page cannot be mistaken for a
  broken run or for another test;
- pages that are inherently sparse (the ingest editors, a list after cleanup) attach their evidence
  as a note instead of another near-empty picture — `test.info().attach('verified.txt', …)`, e.g. the
  read-back `count=1, max(usage)=1.5`, shown expanded under the card;
- `snap(page, 'step.png')` remains available for the rare case where an intermediate state *is* the
  evidence; its caption is the given name, so prefix it with the step, not with a number.
