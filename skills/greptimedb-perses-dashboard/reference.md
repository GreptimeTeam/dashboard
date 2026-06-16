# Perses Dashboard Reference

**Panel catalog & examples:** [catalog.md](catalog.md) — offline JSON shapes; optional `GET /v1/dashboards` for live names.

## Observability modalities (live dashboards)

| Modality | Query | Panel types | Live dashboard |
|----------|-------|-------------|----------------|
| Metrics (SQL) | `GreptimeDBTimeSeriesQuery` via `TimeSeriesQuery` | `TimeSeriesChart`, `StatChart`, `Table` | `GreptimeDB Perses Demo`, `test` |
| Metrics (PromQL) | `PrometheusTimeSeriesQuery` via `TimeSeriesQuery` | `TimeSeriesChart`, `GaugeChart`, `StatChart` | `Node Exporter`, `test` |
| Logs | `GreptimeDBLogQuery` via **`LogQuery`** | `LogsTable` | `log` |
| Traces | `GreptimeDBTraceQuery` via **`TraceQuery`** | `TraceTable`, `TracingGanttChart` | `Traces Demo` |

Tables: `cpu_metrics_30`, `temp_alerts`, `penguins_size` (SQL metrics); `logtest` (logs); `web_trace_demo` (traces). **Time column names** in SQL (`ts`, `time_window`, `greptime_timestamp`, `timestamp`) are per-table schema results — detect via [Time column detection](#time-column-detection), do not hardcode.

## SQL vs PromQL decision tree

```
User request
├── Data is Prometheus metric (node_*, custom counter/histogram)
│   └── PromQL path
│       ├── Datasource: promql-default (PrometheusDatasource)
│       └── Query: PrometheusTimeSeriesQuery
├── Data is GreptimeDB table (SQL)
│   ├── Time series with tags → GreptimeDBTimeSeriesQuery + TimeSeriesChart
│   ├── Tabular / wide data → GreptimeDBTimeSeriesQuery + Table
│   ├── Logs (message/content columns) → GreptimeDBLogQuery + LogsTable
│   └── Traces (trace_id/span_id) → GreptimeDBTraceQuery + TraceTable/TracingGanttChart
└── User has Grafana JSON
    └── percli migrate -f grafana.json --online
        └── Replace datasource with promql-default or sql-default only
```

**Never** emit Loki/Tempo/Elasticsearch or other third-party datasource plugins.

**Rule of thumb (from Greptime docs):**

- **Metrics → PromQL** — cloud-native dashboards, node_exporter, existing Prometheus habits
- **Logs / Traces / advanced GreptimeDB aggregation → SQL** — RANGE, ALIGN, FILL, joins

## Dashboard top-level structure

```json
{
  "kind": "Dashboard",
  "metadata": {
    "name": "my-dashboard",
    "project": "default",
    "version": 0
  },
  "spec": {
    "display": { "name": "My Dashboard" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "layouts": [],
    "panels": {},
    "datasources": {}
  }
}
```

| Field | Notes |
|-------|-------|
| `metadata.name` | Dashboard ID; used in save API |
| `metadata.project` | Always `"default"` in Greptime Dashboard |
| `spec.duration` | Default time range: `1h`, `6h`, `24h`, etc. |
| `spec.variables` | ListVariable, TextVariable, etc. |
| `spec.layouts` | Array of Grid layouts |
| `spec.panels` | Map of panel ID → Panel object |
| `spec.datasources` | Leave `{}`; app injects `sql-default` and `promql-default` at runtime |

## Layout (24-column Grid)

```json
{
  "kind": "Grid",
  "spec": {
    "display": { "title": "Panel Group", "collapse": { "open": true } },
    "items": [
      {
        "x": 0,
        "y": 0,
        "width": 24,
        "height": 10,
        "content": { "$ref": "#/spec/panels/<panelId>" }
      }
    ]
  }
}
```

- Grid width = **24 columns**
- Stack vertically: next panel `y` = previous `y` + previous `height`
- Typical heights: Gauge/Stat 6–8, TimeSeries 10–12, Table 19–27, Trace Gantt 30

## Datasource plugins (only two allowed)

Greptime Dashboard registers **exactly two** datasource plugins at runtime (`DashboardView.tsx`). Generated JSON must use only these — no exceptions.

| Name | Plugin `kind` | Allowed query plugins | Data |
|------|---------------|----------------------|------|
| `promql-default` | `PrometheusDatasource` | `PrometheusTimeSeriesQuery` | PromQL metrics |
| `sql-default` | `GreptimeDBDatasource` | `GreptimeDBTimeSeriesQuery`, `GreptimeDBLogQuery`, `GreptimeDBTraceQuery` | SQL (metrics tables, logs, traces, RANGE/ALIGN) |

**Forbidden datasource plugins:** Loki, Tempo, Elasticsearch, InfluxDB, ClickHouse, custom HTTP, Grafana `${ds}` variables, or any `kind` other than `PrometheusDatasource` / `GreptimeDBDatasource`.

**Forbidden datasource names:** anything other than `promql-default` or `sql-default`.

In panel queries, reference by kind + name:

```json
"datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
```

```json
"datasource": { "kind": "PrometheusDatasource", "name": "promql-default" }
```

Leave `spec.datasources: {}` on dashboards — URLs and auth are injected at runtime; never inline datasource config in generated JSON.

### Query wrapper + plugin + datasource

| `queries[].kind` | Query plugin `kind` | Datasource | Example table / query |
|------------------|---------------------|------------|------------------------|
| `TimeSeriesQuery` | `GreptimeDBTimeSeriesQuery` | `sql-default` | `SELECT ... FROM public.cpu_metrics_30` |
| `TimeSeriesQuery` | `PrometheusTimeSeriesQuery` | `promql-default` | `go_gc_duration_seconds`, `node_cpu_seconds_total` |
| `LogQuery` | `GreptimeDBLogQuery` | `sql-default` | `SELECT ... FROM public.logtest` |
| `TraceQuery` | `GreptimeDBTraceQuery` | `sql-default` | `SELECT * FROM public.web_trace_demo` |

Do not use `TimeSeriesQuery` for logs or traces. Do not pair GreptimeDB query plugins with `promql-default`.

## Single panel output

Use when the user wants **one panel** to paste into the Perses editor (not a full dashboard).

### Paste format (required)

Perses **Add panel → From JSON** accepts a **Panel** resource object with root:

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Panel Title" },
    "plugin": { "kind": "<ChartPlugin>", "spec": {} },
    "queries": [ ... ]
  }
}
```

**Do not** output for single-panel requests:

- `kind: "Dashboard"` wrapper
- `spec.panels` map (`{ "<id>": { ... } }`)
- `spec.layouts` / Grid items
- `metadata`

### UI workflow

1. Open dashboard in **edit mode**
2. **Add panel** → **From JSON** (import panel from JSON)
3. Paste the Panel object
4. Adjust position/size in the grid if needed

### Suggested grid sizes (informational only)

Tell the user optionally; do not include in pasted JSON:

| Plugin | Typical width × height |
|--------|------------------------|
| `GaugeChart` / `StatChart` | 6×6 to 8×8 |
| `TimeSeriesChart` | 24×10 to 24×12 |
| `Table` / `LogsTable` | 24×19 to 24×27 |
| `TracingGanttChart` | 24×30 |

### Optional: manual merge bundle

Only provide when user explicitly asks how to merge into dashboard JSON by hand:

```json
{
  "panelId": "a8f3c2e1b9044d6a9f7e2c1d0b5a4e32",
  "panel": { "kind": "Panel", "spec": { ... } },
  "layoutItem": {
    "x": 0, "y": 0, "width": 24, "height": 10,
    "content": { "$ref": "#/spec/panels/a8f3c2e1b9044d6a9f7e2c1d0b5a4e32" }
  }
}
```

Merge: add `panel` under `spec.panels[panelId]`, append `layoutItem` to `spec.layouts[0].spec.items`.

## Panel templates

All templates below are valid **single-panel paste** output unless noted otherwise.

### SQL TimeSeries (simple)

For tables with a TIMESTAMP column per [Time column detection](#time-column-detection). Use that column's **name from schema** in `SELECT` / `WHERE` / `ORDER BY`.

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "CPU Usage (SQL)" },
    "plugin": {
      "kind": "TimeSeriesChart",
      "spec": {
        "legend": { "position": "bottom", "mode": "list" },
        "yAxis": { "format": { "unit": "decimal" }, "label": "cpu_usage" },
        "visual": { "display": "line", "connectNulls": false }
      }
    },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTimeSeriesQuery",
          "spec": {
            "query": "SELECT \"ts\", \"cpu_usage\", \"host\", \"region\" FROM public.\"cpu_metrics_30\" ORDER BY \"ts\" ASC LIMIT 2000;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

(`ts` here is the schema-detected TIMESTAMP column on `cpu_metrics_30` — not a universal default.)

### SQL TimeSeries (RANGE / ALIGN — see [catalog.md §1d](catalog.md#1d-range--align-sql-test-dashboard))

For GreptimeDB time-window aggregation with dashboard time picker. Use the table's schema-detected TIMESTAMP column in SQL (`time_window` on `temp_alerts`):

```sql
SELECT time_window, loc,
  max(max_temp) RANGE '1m' FILL LINEAR AS max_temp
FROM public.temp_alerts
WHERE time_window >= to_timestamp_millis(${__from})
  AND time_window <= to_timestamp_millis(${__to})
ALIGN '30s' BY (loc)
ORDER BY time_window ASC
LIMIT 2000;
```

Panel JSON:

```json
{
  "kind": "GreptimeDBTimeSeriesQuery",
  "spec": {
    "query": "<sql above>",
    "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
  }
}
```

`${__from}` and `${__to}` are **millisecond timestamps** from the dashboard time picker.

### Timestamp precision (units)

After `describe_table`, read the **unit** from `data_type`, not just the column name. GreptimeDB exposes several timestamp types; Perses chart plugins assume **millisecond-scale** values on the x-axis.

| `data_type` (examples) | Unit | Safe in `TimeSeriesChart` / `Table` via `GreptimeDBTimeSeriesQuery`? |
|------------------------|------|----------------------------------------------------------------------|
| `TimestampMillisecond`, `timestamp(3)` | ms | Yes — use column directly (e.g. `ts`, `time_window`, `greptime_timestamp`) |
| `TimestampSecond` | s | Usually OK; prefer `to_timestamp_millis(col) AS ts` if charts misbehave |
| `TimestampNanosecond`, `timestamp(9)` | ns | **No** — raw values exceed JS `Number.MAX_SAFE_INTEGER` (~9e15) and can hang or **crash the dashboard** |

**Rules when generating panels:**

1. **Discover unit first** — check `data_type` for `Nanosecond`, `Millisecond`, or `Second`.
2. **`TimeSeriesChart` + `GreptimeDBTimeSeriesQuery`** — if the time column is nanosecond (common on trace tables such as `web_trace_demo.timestamp`), **project to milliseconds** in `SELECT`:
   ```sql
   SELECT to_timestamp_millis(timestamp) AS ts, service_name, count(*) RANGE '5m' AS span_count
   FROM public.web_trace_demo
   ALIGN '1m' BY (service_name)
   ORDER BY ts ASC
   LIMIT 2000;
   ```
   Do **not** pass raw `timestamp` (nanosecond) as the chart time column.
3. **`Table` + synthetic time** — `to_timestamp_millis(${__to}) AS ts` is already millisecond; keep using it for `GROUP BY` aggregates.
4. **`TraceTable` / `TracingGanttChart` + `GreptimeDBTraceQuery`** — raw `timestamp` in SQL is OK; trace plugins handle span timestamps. Do **not** switch these to `TimeSeriesQuery`.
5. **WHERE time filters** — `${__from}` / `${__to}` and `to_timestamp_millis(...)` are **milliseconds**. GreptimeDB compares them to table timestamp columns correctly, but:
   - If dashboard `duration` is shorter than the data's actual time range (e.g. trace data months in the past), filtered panels return **empty** — not a crash. Prefer omitting `${__from}`/`${__to}` on trace overview panels (see `Traces Demo`) or set a wide `duration` only when the user needs time-scoped stats.
6. **RANGE / ALIGN** — the time column in the result set must still be millisecond-safe for charts; wrap nanosecond source columns with `to_timestamp_millis(...) AS ts`.

**Known tables:**

| Table | Time column | `data_type` | Chart SQL time expression |
|-------|-------------|-------------|---------------------------|
| `cpu_metrics_30` | `ts` | `TimestampMillisecond` | `ts` |
| `temp_alerts` | `time_window` | `TimestampMillisecond` | `time_window` |
| `penguins_size` | `greptime_timestamp` | `TimestampMillisecond` | `greptime_timestamp` |
| `logtest` | `ts` | `TimestampMillisecond` | `ts` |
| `web_trace_demo` | `timestamp` | `TimestampNanosecond` | `to_timestamp_millis(timestamp) AS ts` for **metrics-style** charts only |

Validate nanosecond → millisecond chart queries with `execute_sql` before delivering.

### SQL Table

Perses `Table` is a **time-series table**: each row = one series (`timestamp` + `value` + label columns). It does **not** render raw SQL row sets from `metadata.table`.

| Query shape | Table behavior |
|-------------|----------------|
| Row table with schema TIMESTAMP column in result (`SELECT *`, etc.) | One row per series; non-time columns become labels |
| `GROUP BY` aggregate **without** time column | **Broken** — plugin collapses to one scalar series → one row (`timestamp` + `value`) |
| `GROUP BY` with synthetic time + labels | **Correct** — one row per group; hide `timestamp` via `columnSettings` |

**Row table** (works out of the box):

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Data Table" },
    "plugin": { "kind": "Table", "spec": { "density": "standard", "enableFiltering": true } },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTimeSeriesQuery",
          "spec": {
            "query": "SELECT * FROM public.\"penguins_size\" ORDER BY \"greptime_timestamp\" DESC LIMIT 100;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

**Aggregate / GROUP BY** (add constant time column; dimension columns become labels):

```sql
SELECT to_timestamp_millis(${__to}) AS ts,
       service_name,
       count(*) AS span_count
FROM public.web_trace_demo
GROUP BY service_name
ORDER BY span_count DESC
LIMIT 20;
```

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Spans by Service" },
    "plugin": {
      "kind": "Table",
      "spec": {
        "density": "standard",
        "enableFiltering": true,
        "columnSettings": [
          { "name": "service_name", "header": "Service", "enableSorting": true },
          { "name": "value", "header": "Span Count", "enableSorting": true, "sort": "desc" },
          { "name": "timestamp", "hide": true }
        ]
      }
    },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTimeSeriesQuery",
          "spec": {
            "query": "<sql above>",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

For category rankings without a table, `TimeSeriesChart` with `"visual": { "display": "bar" }` is often clearer.

### StatChart: scalar vs sparkline

StatChart shows a big number (`calculation: "last-number"`) and optionally a mini trend (`sparkline`).

| Query shape | Example | `sparkline` |
|-------------|---------|-------------|
| **Scalar** — one row, no time column | `SELECT count(*) FROM public.logtest` | **Do not set** — UI may show the toggle but no line renders |
| **Time series** — TIMESTAMP column + value(s) over range | `go_goroutines`, or `SELECT <time_col>, count(*) ... GROUP BY <time_col>` using schema-detected name | Optional — set `sparkline: {}` if user wants a trend |

**Scalar StatChart template** (row counts, error totals, table inventory):

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Log Lines" },
    "plugin": {
      "kind": "StatChart",
      "spec": {
        "calculation": "last-number",
        "format": { "unit": "decimal", "decimalPlaces": 0 }
      }
    },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTimeSeriesQuery",
          "spec": {
            "query": "SELECT count(*) FROM public.logtest",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

Do **not** include `"sparkline": {}` for scalar stats.

**Time-series StatChart** (sparkline allowed) — query must return points across `${__from}`/`${__to}`; include the schema-detected TIMESTAMP column in SQL:

```json
"sparkline": {},
"query": "SELECT date_bin('1s', ts) AS ts, count(*) AS n FROM public.logtest WHERE ts >= to_timestamp_millis(${__from}) AND ts <= to_timestamp_millis(${__to}) GROUP BY ts ORDER BY ts ASC LIMIT 2000;"
```

(`ts` = TIMESTAMP column on `logtest` per schema — substitute your table's detected name.)

### PromQL Gauge

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "CPU Busy" },
    "plugin": {
      "kind": "GaugeChart",
      "spec": {
        "calculation": "last-number",
        "format": { "unit": "percent" },
        "max": 100,
        "thresholds": {
          "steps": [
            { "color": "rgba(237, 129, 40, 0.89)", "value": 85 },
            { "color": "rgba(245, 54, 54, 0.9)", "value": 95 }
          ]
        }
      }
    },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "PrometheusTimeSeriesQuery",
          "spec": {
            "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
            "query": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
          }
        }
      }
    }]
  }
}
```

### PromQL TimeSeries

```json
{
  "kind": "PrometheusTimeSeriesQuery",
  "spec": {
    "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
    "query": "sum by (mode) (rate(node_cpu_seconds_total[5m]))"
  }
}
```

### Logs panel

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Logs" },
    "plugin": { "kind": "LogsTable", "spec": { "showTime": true, "allowWrap": true, "enableDetails": true } },
    "queries": [{
      "kind": "LogQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBLogQuery",
          "spec": {
            "query": "SELECT ts, message, content FROM public.logtest ORDER BY ts DESC LIMIT 500;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

### Trace Gantt

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Trace <trace_id>" },
    "plugin": { "kind": "TracingGanttChart", "spec": {} },
    "queries": [{
      "kind": "TraceQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTraceQuery",
          "spec": {
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" },
            "query": "SELECT * FROM \"spans\" WHERE trace_id = '<trace_id>' ORDER BY timestamp ASC"
          }
        }
      }
    }]
  }
}
```

## Building a complete dashboard

Helper pattern for agents:

1. Generate unique panel IDs (32-char hex)
2. Build `panels` map
3. Build `layouts[0].spec.items` with `$ref` to each panel
4. Set `metadata.name` and `spec.display.name` to user-provided name

Empty dashboard skeleton:

```json
{
  "kind": "Dashboard",
  "metadata": { "name": "empty-dashboard", "project": "default", "version": 0 },
  "spec": {
    "display": { "name": "empty-dashboard" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "layouts": [],
    "panels": {},
    "datasources": {}
  }
}
```

## Grafana migration

When user provides Grafana JSON:

```bash
percli migrate -f grafana-dashboard.json --online -o json > perses-dashboard.json
```

- Migration is best-effort; review datasource and variable mappings
- Replace **all** Grafana datasource variables (`${ds}`, `DS_PROMETHEUS`, etc.) with `promql-default` / `PrometheusDatasource` (metrics) or `sql-default` / `GreptimeDBDatasource` (SQL) — no other plugins exist in this app
- Local reference: `Node Exporter` dashboard at `GET /v1/dashboards`
- Docs: https://perses.dev/perses/docs/migration/

## HTTP API (host and auth)

Use when the **GreptimeDB MCP server** is unavailable. All paths are relative to `{host}` (no trailing slash). Agents **with** MCP should prefer MCP tools; HTTP is the portable fallback for any environment.

### HTTP API host and auth

**Resolve `{host}`** (first success wins):

| Priority | Source | Typical value |
|----------|--------|---------------|
| 1 | User states GreptimeDB / Dashboard API URL | `https://greptime.prod.example.com` |
| 2 | `GREPTIME_HOST` env var | `http://127.0.0.1:4000` |
| 3 | Local dev default | `http://127.0.0.1:4000` |

Greptime Dashboard dev server proxies `/v1/*` to `127.0.0.1:4000` (`config/vite.config.base.ts`). The UI origin (e.g. `http://localhost:5173`) is **not** the SQL API — curl/scripts should target the GreptimeDB HTTP backend (`{host}` above).

**Verify connection** before schema discovery:

```bash
HOST="${GREPTIME_HOST:-http://127.0.0.1:4000}"
curl -sS "$HOST/v1/sql" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "sql=SELECT 1"
```

Optional auth (same as save script):

```bash
# user:password → Basic base64
export GREPTIME_AUTH='admin:admin'
export GREPTIME_DB='public'   # optional → x-greptime-db-name header

AUTH_HEADER=$(printf '%s' "$GREPTIME_AUTH" | base64 | tr -d '\n')
curl -sS "$HOST/v1/sql" \
  -H "Authorization: Basic $AUTH_HEADER" \
  -H "x-greptime-db-name: $GREPTIME_DB" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "sql=SELECT 1"
```

### MCP ↔ HTTP mapping

| MCP tool | HTTP equivalent |
|----------|-----------------|
| `health_check` | `POST {host}/v1/sql` with `SELECT 1` |
| `describe_table` | `POST {host}/v1/sql` with `DESCRIBE TABLE schema.table` |
| `execute_sql` | `POST {host}/v1/sql` — body: `sql=<query>` (`application/x-www-form-urlencoded`) |
| `query_range` | `GET {host}/v1/prometheus/api/v1/query_range?query=...&start=...&end=...&step=...` |
| `explain_query` | `POST {host}/v1/sql` with `EXPLAIN <query>` |

**Schema via SQL** (when `DESCRIBE` is unavailable):

```sql
SELECT column_name, data_type, semantic_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cpu_metrics_30'
ORDER BY ordinal_position;
```

**List tables:**

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
ORDER BY table_schema, table_name;
```

### Dashboard list (templates)

```bash
curl -sS "${GREPTIME_HOST:-http://127.0.0.1:4000}/v1/dashboards"
```

If empty, use offline [catalog.md](catalog.md).

## Save API

Greptime Dashboard stores Perses JSON via:

```http
POST /v1/dashboards/{name}
Content-Type: application/json

{ "content": "<stringified Dashboard JSON object>" }
```

**Important:** `content` is a JSON **string** of the dashboard object. The list API returns `definition.content` with extra escaping — that is storage format, not the POST body shape.

List response shape:

```json
{
  "dashboards": [
    { "name": "my-dashboard", "definition": "{\"content\":\"...\"}" }
  ]
}
```

### Save script

```bash
skills/greptimedb-perses-dashboard/scripts/save-dashboard.sh \
  --name my-dashboard \
  --file dashboard.json \
  --host http://127.0.0.1:4000
```

Environment variables:

| Variable | Purpose |
|----------|---------|
| `GREPTIME_HOST` | Default API host (overridden by `--host`) |
| `GREPTIME_AUTH` | Basic auth token (raw base64 or `user:pass`) |
| `GREPTIME_DB` | Value for `x-greptime-db-name` header |

## Time column detection

**Do not guess the time column by name** (`ts`, `greptime_timestamp`, `time_window`, etc.). Use the same rules as Greptime Dashboard SQL Builder (`src/components/sql-builder/index.vue`) and `src/utils/table-normalizer.ts`.

### Algorithm (from `describe_table` / `information_schema`)

Given `columns[]` with `name`, `data_type`, `semantic_type`:

```typescript
const tsColumns = columns.filter((col) =>
  col.data_type.toLowerCase().includes('timestamp')
)
const tsIndexColumns = tsColumns.filter((col) => col.semantic_type === 'TIMESTAMP')
const timeColumn = tsIndexColumns.length ? tsIndexColumns[0] : tsColumns[0] ?? null
```

| Step | Rule |
|------|------|
| 1 | Candidate if `data_type` contains `timestamp` (case-insensitive), e.g. `TimestampMillisecond`, `timestamp(3)` |
| 2 | Prefer candidates with `semantic_type === 'TIMESTAMP'` |
| 3 | Select first preferred column; if none, first timestamp `data_type` column |
| 4 | No match → treat table as having **no** time column; use MCP / user input — never default to `ts` by name |

Use the selected column `name` in SQL (`WHERE`, `ORDER BY`, `GROUP BY`) and in docs/examples for that table.

### Examples (algorithm output, not name rules)

| Table | Typical selected column | Notes |
|-------|-------------------------|-------|
| `cpu_metrics_30` | `ts` | `TIMESTAMP` semantic |
| `penguins_size` | `greptime_timestamp` | `TIMESTAMP` semantic |
| `temp_alerts` | `time_window` | `TIMESTAMP` semantic |
| `web_trace_demo` | `timestamp` | `TimestampNanosecond`; use `to_timestamp_millis(timestamp) AS ts` for metrics-style charts — see [Timestamp precision](#timestamp-precision-units) |

### Perses plugin (query results only)

`@perses-dev/greptimedb-plugin` `findTimeColumnIndex()` also falls back to column **names** (`greptime_timestamp`, `timestamp`, `ts`, `time`) when parsing **SQL result** schemas for charts. That affects rendering only. When **discovering schema** or **writing SQL**, always use `data_type` + `semantic_type` above.

`GreptimeDBTimeSeriesQuery` `timeColumn` in panel JSON is **legacy** (not used at query execution); time column in results is auto-detected by the plugin.

### Other column roles (name hints OK)

| Column pattern | Likely role |
|-------------|-------------|
| `trace_id`, `span_id` | Trace identifiers |
| `message`, `content`, `body` | Log text |
| Other numeric | Value columns |
| String / low cardinality | Tag / group-by columns |

## Repo cross-references

- Empty dashboard: `src/views/dashboard/perses/index.vue` → `createEmptyDashboard()`
- Trace Gantt builder: `src/dashboard-main.tsx` → `buildTraceGanttFile()`
- API client: `src/api/dashboards.ts`
- Plugins: `src/perses-dashboard/react/plugin.ts`
- PromQL examples: `src/views/dashboard/playground/docs/host-metrics-promql.md`
- RANGE/ALIGN SQL: `src/views/dashboard/playground/docs/getting-started.md`
