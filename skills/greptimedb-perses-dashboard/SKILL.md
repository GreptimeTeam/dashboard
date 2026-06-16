---
name: greptimedb-perses-dashboard
description: >-
  Generate Perses dashboards or single panels for GreptimeDB. Use when the user
  asks to create, generate, or scaffold a Perses dashboard or panel from table
  names, SQL/PromQL queries, natural-language prompts, or JSON paste into the
  Perses editor. Dashboard output is compatible with GET/POST /v1/dashboards;
  panel output is a paste-ready Panel object with kind Panel. Datasources are
  limited to promql-default (Prometheus) and sql-default (GreptimeDB) only.
  Reference GET /v1/dashboards for live metrics (SQL/PromQL), logs, and traces formats.
license: Apache-2.0
compatibility: Any Agent Skills or MCP-capable host (Cursor, Claude Desktop/Code, GitHub Copilot, Codex, Gemini CLI, custom agents, etc.); GreptimeDB Dashboard with Perses; data via GreptimeDB MCP server or HTTP API
---

# Perses Dashboard Generator

Generate Perses `Dashboard` or single `Panel` JSON for the GreptimeDB Dashboard app.

**Read first:** [catalog.md](catalog.md) — panel shapes, JSON examples, live dashboard index.

Also: [reference.md](reference.md) (schema, SQL/PromQL rules).

**Output modes:**

| User intent | Output |
|-------------|--------|
| dashboard / save to API | Full `Dashboard` JSON |
| panel / single panel / paste JSON | Single `Panel` object only (`kind: "Panel"`) |

## Datasource constraint (hard rule)

Greptime Dashboard **only** supports two datasource plugins. Never use any other `kind` or `name`:

| Name | Plugin kind | Query plugins |
|------|-------------|---------------|
| `promql-default` | `PrometheusDatasource` | `PrometheusTimeSeriesQuery` |
| `sql-default` | `GreptimeDBDatasource` | `GreptimeDBTimeSeriesQuery`, `GreptimeDBLogQuery`, `GreptimeDBTraceQuery` |

Forbidden: Loki, Tempo, Elasticsearch, InfluxDB, `${ds}`, Grafana datasource variables, inline URLs, or any other datasource.

When migrating Grafana JSON, **replace** all datasource references with `promql-default` or `sql-default`.

## Data access (required)

Before generating panels, discover **real** table/column names and dry-run queries. Use **either** path below — not both unless cross-checking.

| Path | When to use | Host / connection |
|------|-------------|-------------------|
| **GreptimeDB MCP server** | Any agent with [MCP](https://modelcontextprotocol.io) enabled | Host/auth in the agent’s MCP server config; call `health_check` to verify |
| **HTTP API** | No MCP, shell/curl, CI, scripted agents | Resolve `GREPTIME_HOST` (see [reference.md — HTTP host](reference.md#http-api-host-and-auth)) |

Do **not** invent table/column names without discovery.

### MCP (GreptimeDB MCP server)

The GreptimeDB MCP server is **agent-agnostic** — any host that implements the [Model Context Protocol](https://modelcontextprotocol.io) can use it (Cursor, Claude Desktop, Claude Code, VS Code Copilot, Codex, Gemini CLI, custom runners, etc.). The server name in config may vary (e.g. `user-greptimedb`, `greptimedb`); tool names below are what the server exposes.

| Tool | When to use |
|------|-------------|
| `health_check` | Confirm MCP can reach GreptimeDB before discovery |
| `describe_table` | Column names, `data_type`, `semantic_type` |
| `execute_sql` | Sample rows, dry-run SQL panel queries |
| `query_range` | Validate PromQL metrics exist and return data |
| `explain_query` | Debug slow or failing SQL |

MCP host/auth is **not** passed per tool call — it is set once in the agent’s MCP config (stdio command, env vars, or remote URL). If `health_check` fails, fix that MCP server entry or fall back to HTTP.

### HTTP (no MCP)

Same operations via GreptimeDB HTTP API on `{host}`:

| Need | Endpoint | Example |
|------|----------|---------|
| Probe connection | `POST {host}/v1/sql` | `SELECT 1` |
| List dashboards (templates) | `GET {host}/v1/dashboards` | — |
| Table schema | `POST {host}/v1/sql` | `DESCRIBE TABLE public.my_table` or `information_schema.columns` |
| Run SQL | `POST {host}/v1/sql` | Panel query with literals instead of `${__from}` |
| PromQL range | `GET {host}/v1/prometheus/api/v1/query_range` | `query`, `start`, `end`, `step` |
| Save dashboard | `POST {host}/v1/dashboards/{name}` | `save-dashboard.sh` |

**Confirm `host` (HTTP only)** — resolve in order, stop when a probe succeeds:

1. **User-provided** URL (e.g. `https://greptime.example.com`, `http://127.0.0.1:4000`)
2. **`GREPTIME_HOST`** environment variable
3. **Local default:** `http://127.0.0.1:4000` (GreptimeDB HTTP API; matches `config/vite.config.base.ts` dev proxy target)
4. **Same origin as Dashboard UI** — if the user runs Greptime Dashboard in dev, frontend `/v1/*` is proxied to `127.0.0.1:4000`; direct curl still targets that backend unless deployed otherwise

Probe (replace host and auth as needed):

```bash
HOST="${GREPTIME_HOST:-http://127.0.0.1:4000}"
curl -sS -o /dev/null -w "%{http_code}" -X POST "$HOST/v1/sql" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "sql=SELECT 1"
# Expect HTTP 200
```

Auth headers for HTTP: `GREPTIME_AUTH` (Basic), `GREPTIME_DB` (`x-greptime-db-name`) — same as [save-dashboard.sh](scripts/save-dashboard.sh). Full curl patterns: [reference.md — HTTP API](reference.md#http-api-host-and-auth).

If discovery and HTTP both fail, use offline [catalog.md](catalog.md) shapes only and tell the user which host/MCP setting is missing.

## Live reference API

Fetch existing dashboards before generating (match real query/panel shapes):

```bash
curl -s "${GREPTIME_HOST:-http://127.0.0.1:4000}/v1/dashboards"
```

| User asks for | Copy patterns from dashboard |
|---------------|------------------------------|
| SQL metrics / table | `GreptimeDB Perses Demo`, `test` |
| PromQL / node exporter | `Node Exporter`, `test` (panel `prom`) |
| Logs | `log` |
| Traces | `Traces Demo` |
| Mixed observability | `GreptimeDB Perses Demo` + `log` + `Traces Demo` |

See [catalog.md](catalog.md) for parsed panel JSON per modality.

## Workflow

### 1. Clarify input

Identify one of:

- Table name (`schema.table` or `public.my_table`)
- Natural language goal ("monitor CPU", "temperature by location")
- Existing SQL or PromQL query
- Grafana JSON to migrate (use `percli migrate`, then tweak — see [reference.md](reference.md))
- Multi-modal observability (metrics + logs + traces)
- **Single panel only** (paste into Perses editor → Add panel → JSON)

Default to **single panel** when the user mentions: panel, single panel, paste JSON, add panel, import panel.

Default to **full dashboard** when the user mentions: dashboard, save dashboard, `/v1/dashboards`.

### 2. Choose data path

Follow the Greptime + Perses guide:

| Scenario | Path | Datasource | Query plugin |
|----------|------|------------|--------------|
| Prometheus metrics, node_exporter | **PromQL** | `promql-default` | `PrometheusTimeSeriesQuery` |
| GreptimeDB tables, logs, traces, RANGE/ALIGN | **SQL** | `sql-default` | `GreptimeDBTimeSeriesQuery` / `GreptimeDBLogQuery` / `GreptimeDBTraceQuery` |
| Grafana JSON provided | **Migrate first** | Map to `promql-default` after migration | — |

### 3. Discover data (MCP or HTTP)

**SQL path** — MCP: `describe_table` + `execute_sql … LIMIT 5`. HTTP: `DESCRIBE TABLE` / `information_schema` + `POST /v1/sql`.

Identify:

- **Time column:** use schema detection (below) — **not** column-name guessing
- **Time unit:** read `data_type` for `Nanosecond` vs `Millisecond` — nanosecond columns (e.g. `web_trace_demo.timestamp`) must use `to_timestamp_millis(col) AS ts` in **`TimeSeriesChart` / `Table`** queries or the UI can hang/crash ([reference.md — Timestamp precision](reference.md#timestamp-precision-units))
- **Value columns:** numeric fields for charts
- **Tag columns:** dimensions for series grouping (`host`, `loc`, `sensor_id`)
- **Trace columns:** `trace_id`, `span_id`, `parent_span_id`
- **Log columns:** `message`, `content`, `body`, `level`

**Time column** (same as SQL Builder — `src/components/sql-builder/index.vue`, `src/utils/table-normalizer.ts`):

1. From `describe_table` columns, keep those where `data_type.toLowerCase().includes('timestamp')`
2. Prefer `semantic_type === 'TIMESTAMP'`
3. Pick the first match in that preferred set; else the first timestamp `data_type` column
4. If none → no time column; do not assume `ts` / `greptime_timestamp` by name

See [reference.md — Time column detection](reference.md#time-column-detection).

**PromQL path** — MCP: `query_range`. HTTP: `GET /v1/prometheus/api/v1/query_range` (or labels API).

### 4. Select panel type

| Modality | Chart plugin | Query wrapper `kind` | Query plugin |
|----------|--------------|----------------------|--------------|
| Metrics (SQL) | `TimeSeriesChart`, `StatChart`, `Table` | `TimeSeriesQuery` | `GreptimeDBTimeSeriesQuery` |
| Metrics (PromQL) | `TimeSeriesChart`, `GaugeChart`, `StatChart` | `TimeSeriesQuery` | `PrometheusTimeSeriesQuery` |
| Logs | `LogsTable` | `LogQuery` | `GreptimeDBLogQuery` |
| Traces | `TraceTable`, `TracingGanttChart` | `TraceQuery` | `GreptimeDBTraceQuery` |

Live examples: [catalog.md](catalog.md). Do not use `TimeSeriesQuery` for logs/traces.

Registered plugins in this app: `TimeSeriesChart`, `StatChart`, `GaugeChart`, `Table`, `LogsTable`, `TraceTable`, `TracingGanttChart`.

**StatChart + sparkline:** Only enable `sparkline` when the query returns a **time series** (multiple points over time). For **scalar / single-value** queries (e.g. `SELECT count(*) FROM ...`, `SELECT count(*) FROM ... WHERE ...` with no time column), use StatChart **without** `sparkline` — omit the field entirely. See [reference.md — StatChart](reference.md#statchart-scalar-vs-sparkline).

**Table + GROUP BY:** `Table` renders **one row per time series**, not raw SQL rows. `GROUP BY` without a TIMESTAMP column in the result collapses to a single row (`timestamp` + count). Add a **synthetic** time expression (e.g. `to_timestamp_millis(${__to}) AS ts`) and put dimensions in non-value columns; hide the synthetic `timestamp` column in `columnSettings`. See [reference.md — SQL Table](reference.md#sql-table).

### 5. Generate JSON

#### Single panel (paste into Perses editor)

Output **only** a Panel object — no dashboard wrapper, no layout, no panel ID map:

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "..." },
    "plugin": { "kind": "TimeSeriesChart", "spec": {} },
    "queries": [ ... ]
  }
}
```

Rules:

- Top-level `kind` must be `"Panel"`
- Include `spec.display.name`, `spec.plugin`, `spec.queries`
- Datasource: **only** `sql-default` (`GreptimeDBDatasource`) or `promql-default` (`PrometheusDatasource`)
- User pastes this in Perses edit mode: **Add panel → From JSON** (or equivalent import)

Optionally append a one-line note with suggested grid size (e.g. `width: 24, height: 10`).

See [reference.md — Single panel](reference.md#single-panel-output).

#### Full dashboard

Rules:

- `kind: "Dashboard"`, `metadata.project: "default"`, `metadata.version: 0`
- Panel IDs: 32-char lowercase hex (e.g. `a8f3c2e1b9044d6a9f7e2c1d0b5a4e32`)
- Layout: 24-column `Grid`; stack panels vertically (`y` += previous `height`)
- Datasources: reference `sql-default` or `promql-default` only — **never** embed URLs
- Default `duration: "1h"`, `refreshInterval: "30s"`
- `spec.datasources: {}` (runtime injects globals)

Use helpers from [reference.md](reference.md) to build panels and layouts.

### 6. Validate queries

Before delivering, dry-run **every** panel query (MCP `execute_sql` / `query_range`, or HTTP equivalents on resolved `GREPTIME_HOST`):

Fix errors before output. Replace `${__from}`/`${__to}` with literal millis when dry-running SQL.

### 7. Deliver

**Single panel:** Output pretty-printed Panel JSON only + brief explanation. Do not wrap in Dashboard.

**Full dashboard:** Output pretty-printed Dashboard JSON + brief explanation (why PromQL vs SQL, which tables/metrics used).

**If user asks to save dashboard:** Run:

```bash
skills/greptimedb-perses-dashboard/scripts/save-dashboard.sh \
  --name <dashboard-name> \
  --file /path/to/dashboard.json \
  [--host "${GREPTIME_HOST:-http://127.0.0.1:4000}"]
```

Or equivalent `curl` (see [reference.md](reference.md)). Only save when explicitly requested.

## Generation modes

### Mode A — From table name

```
Input: public.cpu_metrics_30
→ describe_table → pick TIMESTAMP column from schema (e.g. `ts` on this table)
→ numeric columns = values; string/low-cardinality = tags
→ TimeSeriesChart with GreptimeDBTimeSeriesQuery
```

### Mode B — Natural language (metrics)

```
Input: "node exporter style CPU/memory monitoring"
→ PromQL path
→ query_range for node_* metrics
→ Gauge + Stat + TimeSeries panels (see [catalog.md §2](catalog.md#2-metrics--promql-prometheustimeseriesquery))
→ Use promql-default; simplify label filters if env-specific labels missing
```

### Mode C — Advanced SQL time series

```
Input: "temperature trend by location from temp_alerts"
→ SQL path with RANGE/ALIGN
→ describe_table → use schema TIMESTAMP column in WHERE (e.g. `time_window` on temp_alerts)
→ See [catalog.md §1d](catalog.md#1d-range--align-sql-test-dashboard) (RANGE/ALIGN SQL)
```

### Mode D — Unified observability

```
Input: "dashboard with CPU metrics, logs, and traces"
→ PromQL for metrics panels
→ GreptimeDBLogQuery for logs
→ GreptimeDBTraceQuery for traces
→ Trace **metrics-style** charts (span rate, etc.): GreptimeDBTimeSeriesQuery with to_timestamp_millis(timestamp) AS ts — never raw nanosecond timestamp in TimeSeriesChart
→ Combine in one Grid layout
```

### Mode F — Traces dashboard

```
Input: "trace dashboard" / public.web_trace_demo
→ describe_table → timestamp is TimestampNanosecond
→ TraceTable / TracingGanttChart: GreptimeDBTraceQuery (raw timestamp OK)
→ StatChart / Table / TimeSeriesChart on same table: GreptimeDBTimeSeriesQuery; chart time column must be millisecond (to_timestamp_millis)
→ Follow Traces Demo for TraceTable shape; avoid ${__from}/${__to} on overview unless data is within dashboard duration
```

### Mode E — Single panel (JSON paste)

```
Input: "line chart panel for cpu_metrics_30" / "single PromQL CPU gauge panel"
→ Same discovery as Mode A/B/C but output Panel object only
→ kind: "Panel" at root; no metadata, layouts, or panel ID map
→ User pastes into Perses editor when adding a panel
```

Example output shape — see [catalog.md §6](catalog.md#6-single-panel-paste-ready).

## SQL conventions

- **Time column:** always from schema detection ([reference.md](reference.md#time-column-detection)); use that column name in SQL
- **Timestamp unit:** check `data_type` — for `TimestampNanosecond`, use `to_timestamp_millis(<time_col>) AS ts` in `GreptimeDBTimeSeriesQuery` results; keep raw column only in `GreptimeDBTraceQuery` ([reference.md — Timestamp precision](reference.md#timestamp-precision-units))
- Time filter: `WHERE <time_col> >= to_timestamp_millis(${__from}) AND <time_col> <= to_timestamp_millis(${__to})` (`${__from}`/`${__to}` are **milliseconds**)
- Aggregation: `max(val) RANGE '1m' FILL LINEAR`, `ALIGN '30s' BY (tag_col)`
- Always `LIMIT 2000` (or 100 for tables)
- Quote identifiers: `public."table_name"`, `"column_name"`

## PromQL conventions

- Use `rate()`, `avg_over_time()`, `sum by (label) (...)` per standard patterns
- Reference `host-metrics-promql.md` in repo for node_exporter examples
- Datasource name: always `promql-default` — never `${ds}` or other Grafana datasource variables

## Additional resources

- [catalog.md](catalog.md) — panel shapes, JSON examples, dashboard index
- [reference.md](reference.md) — schema, templates, SQL/PromQL split, API save format
- Perses API: https://perses.dev/perses/docs/api/dashboard/
- Grafana migration: https://perses.dev/perses/docs/migration/
