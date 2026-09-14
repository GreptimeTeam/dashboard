# 07 — Traces Drilldown Spec (MVP)

> Status: MVP in progress. Aligns with [01-product-explore-master §3](./01-product-explore-master.plan.md) and research plan.

## Product shape

- Single `/dashboard/drilldown?signal=traces` — **no separate detail route** (same as Grafana Trace Drilldown drawer model).
- **Home**: toolbar (table + Trace ID) → **equal-width RED triptych** (above) → `panel-tabs`: **Breakdown** (default) | **Traces**.
- Tab state: URL `tracesTab` (omit when `breakdown`); refresh restores tab.
- **Gantt**: full-width drawer (same pattern as Logs detail) when `focusTraceId` set; close clears id, keeps chips.

## Filters (MVP)

1. **Shared topbar**: label chips only (`service_name`, `span_name`, `span_status_code`, `span_kind`) + time + refresh. Do **not** put Trace-ID UI in the global topbar.
2. **Traces home toolbar**: table select (left) + **Trace ID quick search** (right) → `focusTraceId`.
3. No Settings modal (field map is fixed greptime_trace_v1; table pick is enough).

## Table discovery

`listTracesTables` / `resolveTracesTable`:

1. `table_semantics` where `signal_type=trace` (prefer `pipeline=greptime_trace_v1`)
2. Column model: `trace_id` + `parent_span_id` + `timestamp` + `span_name` + `service_name`
3. Prefer `opentelemetry_traces`

Settings: **table name only** (fixed greptime_trace_v1 field map).

## RED coupling

`selectedRedMetric` (`rate` | `errors` | `duration`) is the investigation focus switch.

### RED layout

- Always show **three equal-width** charts (Rate / Errors / Duration).
- Selected chart uses border/background chrome; **do not** enlarge or rearrange (unlike Grafana).
- Click selects `selectedRedMetric` and drives Breakdown aggregation + Traces list (not layout).

### Downstream

| `redMetric` | Triptych cell (`date_bin`) | Breakdown (Phase B) | Traces list |
|-------------|----------------------------|---------------------|-------------|
| rate | **bar** chart, spans/s | same agg `GROUP BY` attr | root spans default |
| errors | **red bar** chart, errors/s | error agg by attr | errored root spans only |
| duration | **heatmap** (time × duration bucket); Y = duration (`s`) | latency by attr (AVG line) | `ORDER BY duration_nano DESC` |

Primary signal MVP: fixed Root (`parent_span_id IS NULL`).

### Breakdown (Phase B)

- Layout/interaction like Metrics cards (select + value grid + Add to filter).
- **Group-by scopes** align with Grafana Attributes sidebar: **All | Resource | Span**.
  - Resource: `service_name` (as `resource.service.name`) + `resource_attributes.*`
  - Span: `span_name` / `span_kind` / `span_status_*` + `span_attributes.*`
  - Default column: `service_name`
- Aggregation bound to current `redMetric`. Data via SQL `date_bin` + `GROUP BY` (not PromQL).
- Discovered columns are merged into traces `fieldMap` so Add to filter resolves in SQL.

## Phased delivery

| Phase | Scope |
|-------|--------|
| **A** | Equal-width RED triptych + `date_bin` queries; Traces list filter/sort by `redMetric`; Gantt already done; Breakdown may stay stub |
| **B** | Breakdown grid: By-attr + value cards; agg tied to `redMetric`; Add to filter |
| **C** | Duration heatmap / percentiles; Comparison / Structure / Exceptions (not MVP) |

## Data

- Root list: `parent_span_id IS NULL` + time + `filtersToSqlWhere` (+ RED list semantics)
- Gantt: `WHERE trace_id = ?` all spans; reuse TraceTimeline
- RED / Breakdown: SQL `date_bin` (Phase A triptych + list; Phase B breakdown grid)

## UI reference

Mirror Logs overview and Metrics breakdown **interaction language**; do not copy `/dashboard/traces` SQL Builder shell into Drilldown.
