# Perses Dashboard Examples

Condensed snippets. **Full live catalog** (metrics SQL/PromQL, logs, traces): [catalog.md](catalog.md).

Source: `GET http://127.0.0.1:4000/v1/dashboards`

**Datasource rule:** Only `promql-default` and `sql-default`. Never `${ds}` in new generated JSON.

## 1. Unified demo dashboard (GreptimeDB Perses Demo)

Combines SQL TimeSeries + Table + time-filtered SQL in one Grid.

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
                  "timeColumn": "ts",
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
                  "timeColumn": "time_window",
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

## 2. SQL TimeSeries with RANGE / ALIGN (Feishu doc)

Recommended SQL for advanced GreptimeDB aggregation:

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

Embed in panel:

```json
{
  "kind": "GreptimeDBTimeSeriesQuery",
  "spec": {
    "query": "SELECT time_window, loc, max(max_temp) RANGE '1m' FILL LINEAR AS max_temp FROM public.temp_alerts WHERE time_window >= to_timestamp_millis(${__from}) AND time_window <= to_timestamp_millis(${__to}) ALIGN '30s' BY (loc) ORDER BY time_window ASC LIMIT 2000;",
    "timeColumn": "time_window",
    "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
  }
}
```

## 3. PromQL Gauge — Node Exporter (Grafana migration)

From migrated `Node Exporter` dashboard. **Always** use `promql-default` / `PrometheusDatasource` — replace `${ds}` from Grafana migration; no other datasource plugins are supported.

```json
{
  "kind": "Panel",
  "spec": {
    "display": {
      "name": "CPU Busy",
      "description": "Busy state of all CPU cores together"
    },
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
            "query": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "seriesNameFormat": ""
          }
        }
      }
    }]
  }
}
```

## 4. PromQL Stat — memory bytes

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

## 5. PromQL TimeSeries — CPU by mode

```json
{
  "kind": "PrometheusTimeSeriesQuery",
  "spec": {
    "datasource": { "kind": "PrometheusDatasource", "name": "promql-default" },
    "query": "sum by (mode) (rate(node_cpu_seconds_total[5m]))"
  }
}
```

## 6. Logs panel — `LogQuery` + GreptimeDBLogQuery

From live `log` dashboard (`public.logtest`). Wrapper kind is **`LogQuery`**, not `TimeSeriesQuery`:

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Logs" },
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
            "query": "SELECT ts, line_no, content, message FROM public.logtest ORDER BY ts DESC LIMIT 500;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

With TextVariable for search:

```json
{
  "kind": "TextVariable",
  "spec": {
    "name": "search",
    "display": { "name": "Search", "description": "Match content or message" },
    "value": ""
  }
}
```

## 7. Traces — `TraceQuery` + GreptimeDBTraceQuery

From live `Traces Demo` dashboard (`public.web_trace_demo`):

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

## 8. Trace Gantt

From `src/dashboard-main.tsx` → `buildTraceGanttFile()`:

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

## 9. Minimal full dashboard from table

Generate when user says: "create **dashboard** for public.cpu_metrics_30"

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
                  "timeColumn": "ts",
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

## 10. Single panel (paste-ready)

Use for: "生成一个 panel" / "JSON 新建 panel" / "单个折线图 panel".

Paste into Perses editor → Add panel → From JSON. **No** dashboard wrapper.

### SQL TimeSeries panel

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
            "timeColumn": "ts",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

Suggested grid: width 24, height 10.

### PromQL Gauge panel

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

Suggested grid: width 6, height 6.

### SQL Table panel

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Penguins Size" },
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
            "query": "SELECT ts, content, message FROM public.logtest ORDER BY ts DESC LIMIT 500;",
            "datasource": { "kind": "GreptimeDBDatasource", "name": "sql-default" }
          }
        }
      }
    }]
  }
}
```

## Prompt → example mapping

| User prompt | Reference |
|-------------|-----------|
| SQL metrics 大盘 | [catalog.md §1](catalog.md#1-metrics--sql-greptimedbtimeseriesquery) or §1 |
| PromQL / node exporter | [catalog.md §2](catalog.md#2-metrics--promql-prometheustimeseriesquery) |
| Logs 大盘 / panel | [catalog.md §3](catalog.md#3-logs-greptimedblogquery) or §6 |
| Traces 大盘 / panel | [catalog.md §4](catalog.md#4-traces-greptimedbtracequery) or §7 |
| RANGE/ALIGN SQL | [catalog.md §1d](catalog.md#1d-range--align-sql-test-dashboard--timewindow-panel) |
| 单个 panel 粘贴 | §10 |
| 一体化监控 | catalog §1 + §3 + §4 |
