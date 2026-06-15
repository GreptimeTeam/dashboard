---
name: perses-dashboard
description: >-
  Generate Perses dashboards or single panels for GreptimeDB. Use when the user
  asks to create, generate, or scaffold a Perses dashboard or panel from table
  names, SQL/PromQL queries, natural-language prompts, or JSON paste into the
  Perses editor. Dashboard output is compatible with GET/POST /v1/dashboards;
  panel output is a paste-ready Panel object with kind Panel. Datasources are
  limited to promql-default (Prometheus) and sql-default (GreptimeDB) only.
  Reference GET /v1/dashboards for live metrics (SQL/PromQL), logs, and traces formats.
---

# Perses Dashboard Generator

Generate Perses `Dashboard` or single `Panel` JSON for the GreptimeDB Dashboard app.

**Read first:** [catalog.md](catalog.md) — live formats from `GET /v1/dashboards` (metrics SQL, metrics PromQL, logs, traces).

Also: [reference.md](reference.md) (schema), [examples.md](examples.md) (snippets).

**Output modes:**

| User intent | Output |
|-------------|--------|
| dashboard / 大盘 / save to API | Full `Dashboard` JSON |
| panel / 单个 panel / 新建 panel / paste JSON | Single `Panel` object only (`kind: "Panel"`) |

**Official guide:** [GreptimeDB + Perses 使用文档](https://greptime.feishu.cn/wiki/XmOcwhsSEiXtAPk6YoUc3j0bnWe)

## Datasource constraint (hard rule)

Greptime Dashboard **only** supports two datasource plugins. Never use any other `kind` or `name`:

| Name | Plugin kind | Query plugins |
|------|-------------|---------------|
| `promql-default` | `PrometheusDatasource` | `PrometheusTimeSeriesQuery` |
| `sql-default` | `GreptimeDBDatasource` | `GreptimeDBTimeSeriesQuery`, `GreptimeDBLogQuery`, `GreptimeDBTraceQuery` |

Forbidden: Loki, Tempo, Elasticsearch, InfluxDB, `${ds}`, Grafana datasource variables, inline URLs, or any other datasource.

When migrating Grafana JSON, **replace** all datasource references with `promql-default` or `sql-default`.

## Live reference API

Fetch existing dashboards before generating (match real query/panel shapes):

```bash
curl -s http://127.0.0.1:4000/v1/dashboards
```

| User asks for | Copy patterns from dashboard |
|---------------|------------------------------|
| SQL metrics / table | `GreptimeDB Perses Demo`, `test` |
| PromQL / node exporter | `Node Exporter`, `test` (panel `prom`) |
| Logs | `log` |
| Traces | `Traces Demo` |
| Mixed observability | `GreptimeDB Perses Demo` + `log` + `Traces Demo` |

See [catalog.md](catalog.md) for parsed panel JSON per modality.

## Prerequisites

Use the **`user-greptimedb`** MCP server for data discovery and query validation:

| Tool | When to use |
|------|-------------|
| `describe_table` | Get column names and types for a table |
| `execute_sql` | Sample rows, dry-run SQL panel queries |
| `query_range` | Validate PromQL metrics exist and return data |
| `explain_query` | Debug slow or failing SQL |

Do **not** invent table/column names without MCP discovery.

## Workflow

### 1. Clarify input

Identify one of:

- Table name (`schema.table` or `public.my_table`)
- Natural language goal ("monitor CPU", "temperature by location")
- Existing SQL or PromQL query
- Grafana JSON to migrate (use `percli migrate`, then tweak — see [reference.md](reference.md))
- Multi-modal observability (metrics + logs + traces)
- **Single panel only** (paste into Perses editor → Add panel → JSON)

Default to **single panel** when the user mentions: panel, 面板, 单个, 新建 panel, JSON 粘贴, add panel.

Default to **full dashboard** when the user mentions: dashboard, 大盘, 保存, `/v1/dashboards`.

### 2. Choose data path

Follow the Greptime + Perses guide:

| Scenario | Path | Datasource | Query plugin |
|----------|------|------------|--------------|
| Prometheus metrics, node_exporter | **PromQL** | `promql-default` | `PrometheusTimeSeriesQuery` |
| GreptimeDB tables, logs, traces, RANGE/ALIGN | **SQL** | `sql-default` | `GreptimeDBTimeSeriesQuery` / `GreptimeDBLogQuery` / `GreptimeDBTraceQuery` |
| Grafana JSON provided | **Migrate first** | Map to `promql-default` after migration | — |

### 3. Discover data (MCP required)

**SQL path:**

```
describe_table → table schema
execute_sql SELECT * FROM <table> LIMIT 5 → confirm time column, tags, values
```

Identify:

- **Time column:** `ts`, `greptime_timestamp`, `time_window`, `timestamp`, etc.
- **Value columns:** numeric fields for charts
- **Tag columns:** dimensions for series grouping (`host`, `loc`, `sensor_id`)
- **Trace columns:** `trace_id`, `span_id`, `parent_span_id`
- **Log columns:** `message`, `content`, `body`, `level`

**PromQL path:**

```
query_range or execute_sql against /v1/prometheus labels
→ confirm metric names (e.g. node_cpu_seconds_total)
```

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

**Table + GROUP BY:** `Table` renders **one row per time series**, not raw SQL rows. `GROUP BY` without a time column collapses to a single row (`timestamp` + count). Add `to_timestamp_millis(${__to}) AS ts` and put dimensions in non-value columns; hide `timestamp` in `columnSettings`. See [reference.md — SQL Table](reference.md#sql-table).

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

Before delivering, dry-run **every** panel query:

- SQL panels → `execute_sql` with the same query (replace `${__from}`/`${__to}` with reasonable millis if needed)
- PromQL panels → `query_range`

Fix errors before output.

### 7. Deliver

**Single panel:** Output pretty-printed Panel JSON only + brief explanation. Do not wrap in Dashboard.

**Full dashboard:** Output pretty-printed Dashboard JSON + brief explanation (why PromQL vs SQL, which tables/metrics used).

**If user asks to save dashboard:** Run:

```bash
.cursor/skills/perses-dashboard/scripts/save-dashboard.sh \
  --name <dashboard-name> \
  --file /path/to/dashboard.json \
  [--host http://127.0.0.1:4000]
```

Or equivalent `curl` (see [reference.md](reference.md)). Only save when explicitly requested.

## Generation modes

### Mode A — From table name

```
Input: public.cpu_metrics_30
→ describe_table + sample
→ ts=time, cpu_usage=value, host/region=tags
→ TimeSeriesChart with GreptimeDBTimeSeriesQuery
```

### Mode B — Natural language (metrics)

```
Input: "node exporter style CPU/memory monitoring"
→ PromQL path
→ query_range for node_* metrics
→ Gauge + Stat + TimeSeries panels (see Node Exporter in examples.md)
→ Use promql-default; simplify label filters if env-specific labels missing
```

### Mode C — Advanced SQL time series

```
Input: "temperature trend by location from temp_alerts"
→ SQL path with RANGE/ALIGN
→ WHERE time_window >= to_timestamp_millis(${__from}) AND ...
→ See Feishu doc SQL pattern in reference.md
```

### Mode D — Unified observability

```
Input: "dashboard with CPU metrics, logs, and traces"
→ PromQL for metrics panels
→ GreptimeDBLogQuery for logs
→ GreptimeDBTraceQuery for traces
→ Combine in one Grid layout
```

### Mode E — Single panel (JSON paste)

```
Input: "生成一个 cpu_metrics_30 的折线图 panel" / "单个 PromQL CPU gauge panel"
→ Same discovery as Mode A/B/C but output Panel object only
→ kind: "Panel" at root; no metadata, layouts, or panel ID map
→ User pastes into Perses editor when adding a panel
```

Example output shape — see [examples.md §9](examples.md#9-single-panel-paste-ready).

## SQL conventions

- Time filter: `WHERE col >= to_timestamp_millis(${__from}) AND col <= to_timestamp_millis(${__to})`
- Aggregation: `max(val) RANGE '1m' FILL LINEAR`, `ALIGN '30s' BY (tag_col)`
- Always `LIMIT 2000` (or 100 for tables)
- Quote identifiers: `public."table_name"`, `"column_name"`

## PromQL conventions

- Use `rate()`, `avg_over_time()`, `sum by (label) (...)` per standard patterns
- Reference `host-metrics-promql.md` in repo for node_exporter examples
- Datasource name: always `promql-default` — never `${ds}` or other Grafana datasource variables

## Additional resources

- [catalog.md](catalog.md) — live dashboards: metrics (SQL/PromQL), logs, traces
- [reference.md](reference.md) — schema, templates, API save format
- [examples.md](examples.md) — condensed snippets
- Perses API: https://perses.dev/perses/docs/api/dashboard/
- Grafana migration: https://perses.dev/perses/docs/migration/
