# Menu smoke (Playwright)

Sequential left-menu smoke: create an ephemeral GreptimeDB database, seed fixtures, SPA-navigate each leaf page with real write/query checks, then drop the database and write an HTML report.

## Prerequisites

- Built assets in `dist/` (`pnpm build` or `pnpm smoke:menu:build`)
- GreptimeDB reachable at `http://127.0.0.1:4000` (override with `SMOKE_DB_HTTP`)
- Chromium for Playwright (`pnpm exec playwright install chromium`)

## Run

```bash
pnpm smoke:menu
# or
pnpm smoke:menu:build
# fail the suite when any page interaction fails
pnpm smoke:menu:strict

# Against a published GitHub release artifact (downloads build.tar.gz)
pnpm smoke:release:tag            # latest
pnpm smoke:release:tag -- v0.14.7
```

Report: `artifacts/menu-smoke/<runId>/index.html` (also mirrored to `artifacts/menu-smoke/latest/`).

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `SMOKE_DB_HTTP` | `http://127.0.0.1:4000` | GreptimeDB HTTP for fixture SQL/APIs |
| `SMOKE_DB_USER` / `SMOKE_DB_PASSWORD` / `SMOKE_DB_AUTH_HEADER` | empty | Auth for `/v1` |
| `SMOKE_PERSES_DASHBOARD` | unset | Force Perses dashboard name (`?dashboard=`) |
| `SMOKE_METRICS_DB` | smoke fixture DB | Override metrics/explore DB (default = ephemeral smoke DB with `smoke_ready_metric`) |
| `SMOKE_STRICT` | unset | Non-zero exit if any page action fails |
| `SMOKE_SKIP_FIXTURE` | unset | Skip CREATE/DROP database (debug only) |
| `SMOKE_HOST` / `SMOKE_PORT` | `127.0.0.1` / `4173` | vite preview bind |
| `SMOKE_NO_OPEN` / `CI` | — | Do not open Playwright HTML report |

## Pages

query → metrics → logs → pipelines → traces → ingest (Influx write) → flow → explore → perses

Perses resolution: `SMOKE_PERSES_DASHBOARD` → reuse existing `/v1/dashboards` → create ephemeral `smoke-e2e-*` (deleted on teardown).
