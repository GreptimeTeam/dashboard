# Live Dashboard Catalog & Examples

Offline panel shapes and copy-paste JSON. When available, cross-check with `GET {GREPTIME_HOST}/v1/dashboards` (default host: `http://127.0.0.1:4000`).

**Datasource rule:** Only `promql-default` and `sql-default`. Never `${ds}` in new generated JSON.

**Time column:** From `describe_table` schema — `data_type` contains `timestamp`, prefer `semantic_type === 'TIMESTAMP'` ([reference.md](reference.md#time-column-detection)). SQL below uses **discovered names** per table; never assume `ts` by convention. Omit `timeColumn` in panel JSON (legacy, unused).

## API shapes

List response:

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

Save (POST body): `{ "content": "<stringified Dashboard>" }` — not the double-wrapped list form.

## Modality matrix

| Modality | Query path | Panel `plugin.kind` | Query `kind` | Query plugin `kind` | Datasource | Live example dashboard |
|----------|------------|---------------------|--------------|---------------------|------------|------------------------|
| **Metrics (SQL)** | SQL on GreptimeDB tables | `TimeSeriesChart`, `StatChart`, `Table` | `TimeSeriesQuery` | `GreptimeDBTimeSeriesQuery` | `sql-default` | `GreptimeDB Perses Demo`, `test` |
| **Metrics (PromQL)** | PromQL | `TimeSeriesChart`, `GaugeChart`, `StatChart` | `TimeSeriesQuery` | `PrometheusTimeSeriesQuery` | `promql-default` | `Node Exporter`, `test` |
| **Logs** | SQL on log tables | `LogsTable` | `LogQuery` | `GreptimeDBLogQuery` | `sql-default` | `log` |
| **Traces** | SQL on trace/span tables | `TraceTable`, `TracingGanttChart` | `TraceQuery` | `GreptimeDBTraceQuery` | `sql-default` | `Traces Demo` |

**Only two datasource plugins:** `PrometheusDatasource` + `GreptimeDBDatasource`. When generating new JSON, always set explicit datasource; older dashboards may omit it and rely on runtime defaults.

---

## 1. Metrics — SQL (`GreptimeDBTimeSeriesQuery`)

**Dashboard:** `GreptimeDB Perses Demo` — multi-panel SQL metrics + table.

### 1a. Simple time series (`cpu_metrics_30`)

Table: `public.cpu_metrics_30`. TIMESTAMP column: `ts` (schema). Tags: `host`, `region`. Value: `cpu_usage`.

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

### 1b. SQL table panel (`penguins_size`)

`Table` shows **one row per time series** (not arbitrary SQL row sets). `SELECT *` works when the result includes a TIMESTAMP column. `GROUP BY` without one collapses to one row — add synthetic `to_timestamp_millis(${__to}) AS ts` and hide `timestamp` in `columnSettings`. See [reference.md — SQL Table](reference.md#sql-table).

Table `penguins_size`: TIMESTAMP column `greptime_timestamp` (schema).

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

TIMESTAMP column on `temp_alerts`: `time_window` (schema).

```sql
SELECT time_window, max_temp, sensor_id, loc
FROM public.temp_alerts
WHERE time_window >= to_timestamp_millis(${__from})
  AND time_window <= to_timestamp_millis(${__to})
ORDER BY time_window ASC
LIMIT 2000;
```

### 1d. RANGE / ALIGN SQL (`test` dashboard)

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

Panel query plugin spec:

```json
{
  "kind": "GreptimeDBTimeSeriesQuery",
  "spec": {
    "query": "SELECT time_window, loc, max(max_temp) RANGE '1m' FILL LINEAR AS max_temp FROM public.temp_alerts WHERE time_window >= to_timestamp_millis(${__from}) AND time_window <= to_timestamp_millis(${__to}) ALIGN '30s' BY (loc) ORDER BY time_window ASC LIMIT 2000;",
    "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
  }
}
```

### 1e. SQL scalar StatChart

Single-value query — **no `sparkline`**.

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

**Dashboard:** `Node Exporter` (Grafana migration). **Dashboard:** `test` (`go_gc_duration_seconds`).

When **generating new** panels, use `promql-default`. Stored `Node Exporter` uses `${ds}` — replace when creating new content.

### 2a. PromQL time series

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

### 2b. PromQL Gauge (CPU Busy)

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

### 2c. PromQL StatChart (memory bytes)

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "SWAP Total", "description": "Total SWAP" },
    "plugin": {
      "kind": "StatChart",
      "spec": {
        "calculation": "last-number",
        "colorMode": "none",
        "format": { "decimalPlaces": 0, "unit": "bytes" },
        "thresholds": { "steps": [{ "color": "#f2495c", "value": 80 }] }
      }
    },
    "queries": [{
      "kind": "TimeSeriesQuery",
      "spec": {
        "plugin": {
          "kind": "PrometheusTimeSeriesQuery",
          "spec": {
            "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
            "query": "node_memory_SwapTotal_bytes"
          }
        }
      }
    }]
  }
}
```

### 2d. PromQL TimeSeries — CPU by mode

```json
{
  "kind": "PrometheusTimeSeriesQuery",
  "spec": {
    "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
    "query": "sum by (mode) (rate(node_cpu_seconds_total[5m]))"
  }
}
```

Pair with `TimeSeriesChart`.

### 2e. Node Exporter layout pattern

- Top row: `GaugeChart` panels at `width: 3, height: 4`
- Below: `TimeSeriesChart` at `width: 12` or `24`
- Variables: `PrometheusLabelValuesVariable` for `job`, `instance` (optional)

---

## 3. Logs (`GreptimeDBLogQuery`)

**Dashboard:** `log` — `public.logtest`. TIMESTAMP column: `ts` (schema).

**Note:** Use `LogQuery` wrapper, not `TimeSeriesQuery`.

### 3a. LogsTable panel (with variables)

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

### 3b. Log dashboard variables

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
      "defaultValue": "all",
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

SQL variables use `$variable_name` in the query string.

---

## 4. Traces (`GreptimeDBTraceQuery`)

**Dashboard:** `Traces Demo` — `public.web_trace_demo`. TIMESTAMP column: `timestamp` (schema), `data_type`: **`TimestampNanosecond`**.

**Note:** Use `TraceQuery` wrapper, not `TimeSeriesQuery`.

**Timestamp unit:** Trace span time is **nanosecond**. `TraceTable` / `TracingGanttChart` may use raw `timestamp` in SQL. Any **`TimeSeriesChart` or `Table` via `GreptimeDBTimeSeriesQuery`** on the same table (span rate, aggregates) must project **`to_timestamp_millis(timestamp) AS ts`** — raw nanosecond values crash Perses charts. See [reference.md — Timestamp precision](reference.md#timestamp-precision-units).

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

Replace `table`, `database` in the trace link for other trace tables.

### 4a-ii. Trace span rate (`TimeSeriesChart` on trace table)

Nanosecond → millisecond in `SELECT`; use `GreptimeDBTimeSeriesQuery` + `TimeSeriesQuery` (not `TraceQuery`):

```sql
SELECT to_timestamp_millis(timestamp) AS ts, service_name, count(*) RANGE '5m' AS span_count
FROM public.web_trace_demo
ALIGN '1m' BY (service_name)
ORDER BY ts ASC
LIMIT 2000;
```

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

## 5. Full dashboard examples

### 5a. GreptimeDB Perses Demo (SQL TimeSeries + Table + filtered SQL)

```json
{
  "kind": "Dashboard",
  "metadata": { "name": "GreptimeDB Perses Demo", "project": "default", "version": 0 },
  "spec": {
    "display": { "name": "GreptimeDB Demo" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "datasources": {},
    "panels": {
      "a8f3c2e1b9044d6a9f7e2c1d0b5a4e32": {
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
      },
      "c22defb716724f3091966e6b705f5df8": {
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
      },
      "0e4364a633404924ba18b63df6cea0af": {
        "kind": "Panel",
        "spec": {
          "display": { "name": "Temperature" },
          "plugin": { "kind": "TimeSeriesChart", "spec": {} },
          "queries": [{
            "kind": "TimeSeriesQuery",
            "spec": {
              "plugin": {
                "kind": "GreptimeDBTimeSeriesQuery",
                "spec": {
                  "query": "SELECT time_window, max_temp, sensor_id, loc\nFROM public.temp_alerts\nWHERE time_window >= to_timestamp_millis(${__from})\n  AND time_window <= to_timestamp_millis(${__to})\nORDER BY time_window ASC\nLIMIT 2000;",
                  "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
                }
              }
            }
          }]
        }
      }
    },
    "layouts": [{
      "kind": "Grid",
      "spec": {
        "display": { "title": "GreptimeDB Demo", "collapse": { "open": true } },
        "items": [
          { "x": 0, "y": 0, "width": 24, "height": 10, "content": { "$ref": "#/spec/panels/a8f3c2e1b9044d6a9f7e2c1d0b5a4e32" } },
          { "x": 0, "y": 10, "width": 24, "height": 19, "content": { "$ref": "#/spec/panels/c22defb716724f3091966e6b705f5df8" } },
          { "x": 0, "y": 29, "width": 24, "height": 12, "content": { "$ref": "#/spec/panels/0e4364a633404924ba18b63df6cea0af" } }
        ]
      }
    }]
  }
}
```

### 5b. Minimal dashboard from one table

Run `describe_table` first; example uses `ts` on `cpu_metrics_30`.

```json
{
  "kind": "Dashboard",
  "metadata": { "name": "cpu-metrics", "project": "default", "version": 0 },
  "spec": {
    "display": { "name": "CPU Metrics" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "datasources": {},
    "panels": {
      "b1c2d3e4f5a6478990a1b2c3d4e5f678": {
        "kind": "Panel",
        "spec": {
          "display": { "name": "CPU Usage" },
          "plugin": { "kind": "TimeSeriesChart", "spec": { "visual": { "display": "line" } } },
          "queries": [{
            "kind": "TimeSeriesQuery",
            "spec": {
              "plugin": {
                "kind": "GreptimeDBTimeSeriesQuery",
                "spec": {
                  "query": "SELECT \"ts\", \"cpu_usage\", \"host\" FROM public.\"cpu_metrics_30\" ORDER BY \"ts\" ASC LIMIT 2000;",
                  "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
                }
              }
            }
          }]
        }
      }
    },
    "layouts": [{
      "kind": "Grid",
      "spec": {
        "items": [{
          "x": 0, "y": 0, "width": 24, "height": 12,
          "content": { "$ref": "#/spec/panels/b1c2d3e4f5a6478990a1b2c3d4e5f678" }
        }]
      }
    }]
  }
}
```

### 5c. Trace Gantt dashboard

From `src/dashboard-main.tsx` → `buildTraceGanttFile()`.

```json
{
  "kind": "Dashboard",
  "metadata": { "name": "trace-gantt-abc123", "project": "default", "version": 0 },
  "spec": {
    "display": { "name": "Trace Gantt - abc123" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "datasources": {},
    "layouts": [{
      "kind": "Grid",
      "spec": {
        "items": [{
          "x": 0, "y": 0, "width": 24, "height": 30,
          "content": { "$ref": "#/spec/panels/traceGanttPanel" }
        }]
      }
    }],
    "panels": {
      "traceGanttPanel": {
        "kind": "Panel",
        "spec": {
          "display": { "name": "Trace abc123" },
          "plugin": { "kind": "TracingGanttChart", "spec": {} },
          "queries": [{
            "kind": "TraceQuery",
            "spec": {
              "plugin": {
                "kind": "GreptimeDBTraceQuery",
                "spec": {
                  "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" },
                  "query": "SELECT * FROM \"spans\" WHERE trace_id = 'abc123' ORDER BY timestamp ASC"
                }
              }
            }
          }]
        }
      }
    }
  }
}
```

---

## 6. Single panel (paste-ready)

Paste into Perses editor → Add panel → From JSON. Root `kind` must be `"Panel"` — no dashboard wrapper.

### 6a. SQL TimeSeries

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "CPU Usage" },
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

Suggested grid: `width: 24, height: 10`.

### 6b. PromQL Gauge

Same as [§2b](#2b-promql-gauge-cpu-busy). Suggested grid: `width: 6, height: 6`.

### 6c. SQL Table

Same as [§1b](#1b-sql-table-panel-penguins_size).

### 6d. Logs

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
            "query": "SELECT ts, content, message FROM public.logtest ORDER BY ts DESC LIMIT 500;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

---

## 7. Query kind cheat sheet

| Wrapper `queries[].kind` | Used for | Plugin `kind` |
|--------------------------|----------|---------------|
| `TimeSeriesQuery` | Metrics charts (SQL or PromQL) | `GreptimeDBTimeSeriesQuery` or `PrometheusTimeSeriesQuery` |
| `LogQuery` | Logs | `GreptimeDBLogQuery` |
| `TraceQuery` | Traces | `GreptimeDBTraceQuery` |

Do not use `TimeSeriesQuery` for logs or traces.

---

## 8. Dashboard index (example deployment)

| Name | Panels | Primary modality |
|------|--------|------------------|
| `GreptimeDB Perses Demo` | 3 | SQL metrics + table |
| `Node Exporter` | 112 | PromQL metrics |
| `Traces Demo` | 1 | Traces |
| `log` | 1 | Logs |
| `test` | 4 | SQL + PromQL mixed |
| `greptime-demo` | 3 | SQL (variant of Demo) |

Re-fetch `GET /v1/dashboards` when this list may be stale. If empty, use sections §1–§6 above.

---

## 9. Prompt → section mapping

| User prompt | Section |
|-------------|---------|
| SQL metrics dashboard | §5a or §1 |
| PromQL / node exporter | §2 |
| Logs dashboard / panel | §3 or §6d |
| Traces dashboard / panel | §4 |
| Trace metrics chart (span rate) | §4a-ii |
| Nanosecond timestamp / chart crash | [reference.md — Timestamp precision](reference.md#timestamp-precision-units) |
| RANGE/ALIGN SQL | §1d |
| Single panel paste | §6 |
| Minimal single-table dashboard | §5b |
| Unified observability (metrics + logs + traces) | §5a + combine §3 + §4 |
