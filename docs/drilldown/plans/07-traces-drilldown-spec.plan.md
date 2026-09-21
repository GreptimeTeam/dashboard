# 07 — Traces Drilldown Spec (MVP)

> Status: MVP in progress. Aligns with [01-product-explore-master §3](./01-product-explore-master.plan.md) and research plan.

## Product shape

- Single `/dashboard/drilldown?signal=traces` — **no separate detail route** (same as Grafana Trace Drilldown drawer model).
- **Home**: toolbar (table + Trace ID) → **equal-width RED triptych** (above) → `panel-tabs`: **Breakdown** (default) | **Traces**.
- Tab state: URL `tracesTab` (omit when `breakdown`); refresh restores tab.
- **Gantt**: full-width drawer (same pattern as Logs detail) when `focusTraceId` set; close clears id, keeps chips.

## Filters (MVP)

1. **单行 topbar filter**：traces 下 key 池 = 全表业务字段 —— intrinsic（`service_name` / `span_name` / `span_kind` / `span_status_code` / `span_status_message` / `scope_*`）+ 扁平属性列（`resource_attributes.*` / `span_attributes.*`）+ `duration_nano`；`trace_id` / `span_id` / `parent_span_id` / 时间列 / `span_events` / `span_links` / `trace_state` 除外（Trace ID 有自己的入口）。实现：`discoverTraceFilterKeys`（`traces/field-map.ts`）+ `fetchSqlLabelKeys(ctx,'traces')`。
2. **算子按列类型**：字符串 `= != =~ !~`；数值（int/uint/float/double/decimal）`= != > >= < <=`，字面量不加引号；boolean `= !=` 渲染 `TRUE`/`FALSE`（Greptime 对 boolean 用 `'true'` 会 planning 报错）。规则集中在 `filters.ts`（`filterOpsForType` / `isValidFilterValue` / `sqlValueLiteral`），traces 查询经 `buildTracesContextWhere` 传 `typeOf`（列类型由 traces init 发布到 `ctx.signalColumnTypes`）。
3. **跨信号**：条件写进共享 `filters` 列表并进 URL `filters` 参数；切到 logs/metrics 时目标表没有的 key 由 `filterAppliesToSignal` 隐藏且不进查询（状态保留，切回可用）。
4. **Traces home toolbar**：table select（左）+ **Trace ID quick search**（右）→ `focusTraceId`；Grafana 式 Attributes 侧栏（All/Resource/Span 分组 + 收藏）留待后续迭代。
5. No Settings modal (field map is fixed greptime_trace_v1; table pick is enough).

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
