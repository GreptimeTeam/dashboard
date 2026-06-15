# Live Dashboard Catalog

**Source of truth:** `GET http://127.0.0.1:4000/v1/dashboards`

Before generating dashboards or panels, agents should **fetch this API** (or ask the user to paste a dashboard name) to match real formats in the deployment. List response shape:

```json
{
  "dashboards": [
    {
      "name": "GreptimeDB Perses Demo",
      "definition": "{\"content\":\"<escaped Dashboard JSON>\"}"
    }
  ]
}
```

Parse: `content = JSON.parse(JSON.parse(definition).content)`

Save shape (POST body): `{ "content": "<stringified Dashboard>" }` — not the double-wrapped list form.

## Modality matrix (from live dashboards)

| Modality | Query path | Panel `plugin.kind` | Query `kind` | Query plugin `kind` | Datasource | Live example dashboard |
|----------|------------|---------------------|--------------|---------------------|------------|------------------------|
| **Metrics (SQL)** | SQL on GreptimeDB tables | `TimeSeriesChart`, `StatChart`, `Table` | `TimeSeriesQuery` | `GreptimeDBTimeSeriesQuery` | `sql-default` | `GreptimeDB Perses Demo`, `test` |
| **Metrics (PromQL)** | PromQL | `TimeSeriesChart`, `GaugeChart`, `StatChart` | `TimeSeriesQuery` | `PrometheusTimeSeriesQuery` | `promql-default` | `Node Exporter`, `test` |
| **Logs** | SQL on log tables | `LogsTable` | `LogQuery` | `GreptimeDBLogQuery` | `sql-default` | `log` |
| **Traces** | SQL on trace/span tables | `TraceTable`, `TracingGanttChart` | `TraceQuery` | `GreptimeDBTraceQuery` | `sql-default` (optional in stored JSON) | `Traces Demo` |

**Only two datasource plugins:** `PrometheusDatasource` + `GreptimeDBDatasource`. When generating new JSON, always set explicit datasource; older dashboards may omit it and rely on runtime defaults.

---

## 1. Metrics — SQL (`GreptimeDBTimeSeriesQuery`)

**Dashboard:** `GreptimeDB Perses Demo` — multi-panel SQL metrics + table.

### 1a. Simple time series (`cpu_metrics_30`)

Table: `public.cpu_metrics_30`. Time column: `ts`. Tags: `host`, `region`. Value: `cpu_usage`.

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
            "timeColumn": "ts",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

### 1b. SQL table panel (`penguins_size`)

`Table` shows **one row per time series** (not arbitrary SQL row sets). `SELECT *` with a time column works; `GROUP BY` without time collapses to one row — add `to_timestamp_millis(${__to}) AS ts` and hide `timestamp` in `columnSettings`. See [reference.md — SQL Table](reference.md#sql-table).

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Penguins Size (Table)" },
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

### 1c. Time-filtered SQL (`temp_alerts` + `${__from}`/`${__to}`)

```sql
SELECT time_window, max_temp, sensor_id, loc
FROM public.temp_alerts
WHERE time_window >= to_timestamp_millis(${__from})
  AND time_window <= to_timestamp_millis(${__to})
ORDER BY time_window ASC
LIMIT 2000;
```

### 1d. RANGE / ALIGN SQL (`test` dashboard — `timewindow` panel)

**Dashboard:** `test`. Production-quality GreptimeDB aggregation:

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

### 1e. SQL scalar stat (`test` — `select count(*) from up`)

Single-value query — **no `sparkline`** (scalar result has no time series to draw).

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Count" },
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

---

## 2. Metrics — PromQL (`PrometheusTimeSeriesQuery`)

**Dashboard:** `Node Exporter` (112 panels, Grafana migration). **Dashboard:** `test` (`go_gc_duration_seconds`).

When **generating new** panels, use `promql-default`. Stored `Node Exporter` uses `${ds}` from Grafana migration — replace when creating new content.

### 2a. Simple PromQL time series (`test`)

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "GC Duration" },
    "plugin": { "kind": "TimeSeriesChart", "spec": {} },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "PrometheusTimeSeriesQuery",
          "spec": {
            "query": "go_gc_duration_seconds",
            "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" }
          }
        }
      }
    }]
  }
}
```

### 2b. PromQL Gauge (`Node Exporter` — CPU Busy)

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "CPU Busy", "description": "Busy state of all CPU cores together" },
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
        },
        "legend": { "show": false }
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

### 2c. PromQL Stat (`Node Exporter` — SWAP Total)

```json
{
  "kind": "PrometheusTimeSeriesQuery",
  "spec": {
    "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
    "query": "node_memory_SwapTotal_bytes"
  }
}
```

Pair with `StatChart` plugin; use `calculation: "last-number"`, `format.unit: "bytes"`.

### 2d. Node Exporter layout pattern

- Top row: multiple `GaugeChart` panels at `width: 3, height: 4` (side by side)
- Below: `TimeSeriesChart` panels at `width: 12` or `24`
- Variables: `PrometheusLabelValuesVariable` for `job`, `instance` (optional; simplify for new dashboards)

---

## 3. Logs (`GreptimeDBLogQuery`)

**Dashboard:** `log` — table `public.logtest`, columns: `ts`, `line_no`, `elapsed_s`, `step_s`, `content`, `message`.

### 3a. LogsTable panel

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "log" },
    "plugin": {
      "kind": "LogsTable",
      "spec": { "showTime": true, "allowWrap": true, "enableDetails": true }
    },
    "queries": [{
      "kind": "LogQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBLogQuery",
          "spec": {
            "query": "SELECT ts, line_no, elapsed_s, step_s, content, message FROM public.logtest WHERE ('$log_category' = 'all' OR ('$log_category' = 'nbconvert' AND content LIKE '%NbConvertApp%') OR ('$log_category' = 'warning' AND (content LIKE '%warn%' OR content LIKE '%Warn%' OR content LIKE '%FutureWarning%')) OR ('$log_category' = 'debugger' AND content LIKE '%Debugger%') OR ('$log_category' = 'system' AND content LIKE '%System snapshot%')) AND (content LIKE '%$search%' OR message LIKE '%$search%') AND line_no >= $min_line LIMIT $max_rows;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

**Note:** Logs use `LogQuery` (not `TimeSeriesQuery`) as the query wrapper kind.

### 3b. Log dashboard variables (`log` dashboard)

```json
[
  {
    "kind": "TextVariable",
    "spec": {
      "name": "search",
      "display": { "name": "Search", "description": "Match content or message (empty matches all)" },
      "value": ""
    }
  },
  {
    "kind": "ListVariable",
    "spec": {
      "name": "log_category",
      "display": { "name": "Log category" },
      "allowAllValue": true,
      "allowMultiple": false,
      "customAllValue": "all",
      "plugin": {
        "kind": "StaticListVariable",
        "spec": { "values": ["nbconvert", "warning", "debugger", "system"] }
      }
    }
  },
  {
    "kind": "TextVariable",
    "spec": { "name": "min_line", "display": { "name": "Min line no" }, "value": "0" }
  },
  {
    "kind": "TextVariable",
    "spec": { "name": "max_rows", "display": { "name": "Max rows" }, "value": "100" }
  }
]
```

SQL variables use `$variable_name` syntax in the query string.

---

## 4. Traces (`GreptimeDBTraceQuery`)

**Dashboard:** `Traces Demo` — table `public.web_trace_demo`.

### 4a. TraceTable (root spans)

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Traces" },
    "plugin": {
      "kind": "TraceTable",
      "spec": {
        "links": {
          "trace": "/__perses_trace_modal__?traceId=${traceId}&table=web_trace_demo&database=public&view=gantt&mode=modal&source=perses-trace-table"
        }
      }
    },
    "queries": [{
      "kind": "TraceQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTraceQuery",
          "spec": {
            "query": "SELECT * FROM \"public\".\"web_trace_demo\" WHERE \"parent_span_id\" IS NULL",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

**Note:** Traces use `TraceQuery` (not `TimeSeriesQuery`) as the query wrapper kind.

Trace link opens Gantt side panel in Greptime Dashboard. Replace `table`, `database` in the link URL for other trace tables.

### 4b. TracingGanttChart (single trace)

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Trace ${traceId}" },
    "plugin": { "kind": "TracingGanttChart", "spec": {} },
    "queries": [{
      "kind": "TraceQuery",
      "spec": {
        "plugin": {
          "kind": "GreptimeDBTraceQuery",
          "spec": {
            "query": "SELECT * FROM \"public\".\"web_trace_demo\" WHERE trace_id = '<trace_id>' ORDER BY timestamp ASC",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

---

## 5. Query kind cheat sheet

| Wrapper `queries[].kind` | Used for | Plugin `kind` |
|--------------------------|----------|---------------|
| `TimeSeriesQuery` | Metrics charts (SQL or PromQL) | `GreptimeDBTimeSeriesQuery` or `PrometheusTimeSeriesQuery` |
| `LogQuery` | Logs | `GreptimeDBLogQuery` |
| `TraceQuery` | Traces | `GreptimeDBTraceQuery` |

Do not use `TimeSeriesQuery` for logs or traces.

---

## 6. Dashboard index (current deployment)

| Name | Panels | Primary modality |
|------|--------|------------------|
| `GreptimeDB Perses Demo` | 3 | SQL metrics + table |
| `Node Exporter` | 112 | PromQL metrics |
| `Traces Demo` | 1 | Traces |
| `log` | 1 | Logs |
| `test` | 4 | SQL + PromQL mixed |
| `greptime-demo` | 3 | SQL (variant of Demo) |

Re-fetch `GET /v1/dashboards` when this list may be stale.
