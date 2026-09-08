# Context 与 Adapters 架构摘要

> 完整 Context 字段与语义层见 [product master](../plans/01-product-explore-master.plan.md)。  
> Grafana 对照见 [grafana research](../plans/03-grafana-drilldown-research.plan.md)。  
> **实现状态**：[implementation-status.md](../summaries/implementation-status.md)

---

## 数据流

```mermaid
flowchart TB
  UI["/dashboard/drilldown UI"]
  Ctx[Correlation Context]
  UI --> Ctx
  Ctx --> MA[metrics adapter]
  Ctx --> LA[logs adapter]
  Ctx --> TA[traces adapter]
  MA --> Prom["Prom API\n__name__/values\nquery_range"]
  LA --> SQLL["SQL\nlogs table"]
  TA --> SQLT["SQL\ntraces table"]
  Sem[table_semantics\nfieldMap\nsettings] --> Ctx
```

---

## Context 字段

| 字段 | 路径 / 状态 |
|------|-------------|
| `timeRange` / `rangeTime` | ✅ [`context.ts`](../../../src/observability/context.ts) |
| `filters[]` | ✅ 顶栏 chips；Prom `match[]` + Logs SQL WHERE |
| `sidebarFilters` | ✅ prefix/suffix 仅影响 catalog，不进 Prom match |
| `metric?` | ✅ 选中后切换详情视图 |
| `focusTraceId?` | ⬜ 类型预留，未接 UI / URL |
| `logsTable` | ✅ auto resolve + URL sync |
| `tracesTable` | ⬜ |
| `fieldMap` | ✅ 默认 logs map；无 Settings UI |

URL 同步：[`use-drilldown-url-sync.ts`](../../../src/observability/use-drilldown-url-sync.ts)

---

## 三 Adapter 职责

### metrics adapter — [`adapters/metrics.ts`](../../../src/observability/adapters/metrics.ts)

| 函数 | 状态 | 说明 |
|------|------|------|
| `fetchMetricNamesPool` | ✅ | `__name__/values` + time + match；series fallback |
| `buildPromMatchSelector` | ✅ | 经 [`filters.ts`](../../../src/observability/filters.ts)；`__name__` chip 不进 matcher |
| `inferPromQL` | ⬜ | stub 在 [`metrics/breakdown.ts`](../../../src/observability/metrics/breakdown.ts) |
| `queryRange` | ⬜ | API 已有，详情主图未接 |
| breakdown labels/values | ✅ | [`metrics/breakdown.ts`](../../../src/observability/metrics/breakdown.ts) |
| relatedMetrics | ⬜ | |

Catalog 编排：[`use-metrics-catalog.ts`](../../../src/observability/use-metrics-catalog.ts)

### logs adapter — [`adapters/logs.ts`](../../../src/observability/adapters/logs.ts)

| 函数 | 状态 | 说明 |
|------|------|------|
| `resolveLogsTable` | ✅ | [`logs/resolve-table.ts`](../../../src/observability/logs/resolve-table.ts) |
| `buildDefaultLogsFieldMap` | ✅ | mount 时 [`use-drilldown-logs-init.ts`](../../../src/observability/use-drilldown-logs-init.ts) |
| `canShowRelatedLogs` | ✅ | filters + logsTable |
| `relatedLogsCount` / `Preview` | ✅ | Related logs Tab |
| `logsVolume` | ⬜ | Logs 首页未建 |

Filter options（Logs DISTINCT）：[`adapters/filter-options.ts`](../../../src/observability/adapters/filter-options.ts)

### traces adapter

⬜ 未建 `adapters/traces.ts`

---

## Filter 栈

| 模块 | 路径 | 状态 |
|------|------|------|
| CRUD + Prom/SQL 映射 | [`filters.ts`](../../../src/observability/filters.ts) | ✅ |
| Greptime match 守卫 | `isGreptimePromMatchSelector` | ✅ |
| 顶栏 UI | [`drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue) | ✅ |
| Label keys / Logs values | [`use-drilldown-filter-options.ts`](../../../src/observability/use-drilldown-filter-options.ts) | ✅ |

---

## 页面结构（当前）

```text
src/views/dashboard/drilldown/
├── index.vue                 # provide Context + 布局
├── components/
│   ├── top-bar.vue           # filter + refresh + time
│   ├── filter-bar.vue
│   ├── drilldown-filter-combobox.vue
│   └── drilldown-filter-pill.vue
└── metrics/
    ├── metrics-sidebar.vue   # prefix / suffix
    ├── main-toolbar.vue      # search + sort
    ├── metric-name-list.vue  # 首页列表
    ├── metric-detail.vue     # Breakdown + Related logs
    ├── breakdown-grid.vue
    └── related-logs-panel.vue
```

---

## 初始加载顺序（Greptime，当前实现）

1. Context 默认时间窗，空 filters
2. **并行**：`resolveLogsTable`（[`use-drilldown-logs-init`](../../../src/observability/use-drilldown-logs-init.ts)）+ metrics 名列表（[`use-metrics-catalog`](../../../src/observability/use-metrics-catalog.ts)）
3. Metrics **仅目录**；选中 metric 后 Breakdown（**无主图** `query_range`）
4. Related logs 需 filters + logsTable

---

## 与 Grafana 差异

| | Grafana | Greptime Drilldown |
|--|---------|-------------------|
| 架构 | 三个 Drilldown App + 跳转 | 单页 Context（当前仅 Metrics 壳） |
| Filter UI | pill + combobox | ✅ 同款 combobox 已实现 |
| Logs volume | Loki `index/volume` | SQL `GROUP BY`（⬜ 未实现） |
| Traces RED | Tempo 派生 | SQL 聚合（Phase 2） |
| Logs 表 | stream label，无需选表 | **必须** `resolveLogsTable` + fieldMap |
| Prom value suggest | 跨 metric `/label/{k}/values` | Greptime 需 `__name__` in match → 顶栏 value 手输 |

---

## 待建模块（规划）

```text
src/observability/
├── table-semantics.ts        # ⬜
├── drilldown-settings.ts     # ⬜
├── deep-links.ts             # ⬜
└── adapters/traces.ts        # ⬜
```
