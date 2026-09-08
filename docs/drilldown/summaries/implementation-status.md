# Drilldown 实现状态（以代码为准）

> **最后更新**：2026-09-02  
> **路由**：`/dashboard/drilldown`（产品代号仍为 Explore / Drilldown；规划文档中的 `/dashboard/explore` 尚未启用）  
> **代码根目录**：[`src/views/dashboard/drilldown/`](../../../src/views/dashboard/drilldown/) · [`src/observability/`](../../../src/observability/)

---

## 总览

当前为 **Metrics Drilldown MVP 进行中**：单页 Context、顶栏 filter、Metrics 目录首页、选中 metric 后的 Breakdown + Related logs。**尚无** Logs/Traces 首页同屏、主 PromQL 图。

```text
/dashboard/drilldown
├── 顶栏：Filters（Grafana combobox）+ Refresh + TimeRange（右）
├── 侧栏：Filter metrics — Prefix / Suffix 树
└── 主区
    ├── 未选 metric → 搜索 + Sort + 计数 + 指标卡片网格（lazy sparkline + Select）
    └── 已选 metric → Breakdown Tab + Related logs Tab（无主图）
```

---

## 已实现模块

### Context 与 URL

| 模块 | 路径 | 状态 |
|------|------|------|
| Context provider | [`src/observability/context.ts`](../../../src/observability/context.ts) | ✅ `filters`, `sidebarFilters`, `metric`, `logsTable`, `fieldMap`, `time`/`rangeTime`, `refreshKey` |
| URL 双向同步 | [`src/observability/use-drilldown-url-sync.ts`](../../../src/observability/use-drilldown-url-sync.ts) | ✅ `filters`, `prefixes`, `suffixes`, `metric`, `logsTable`, `timeLength`/`timeRange` |
| 未同步 URL | — | ⬜ `focusTraceId`、`tracesTable`、fieldMap 持久化 |

### Filter 栈（顶栏）

| 能力 | 路径 | 状态 |
|------|------|------|
| Grafana 式 combobox UI | [`drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue) | ✅ 单边框 + pill + 分阶段 suggest |
| Pill 展示 / 删除 | [`drilldown-filter-pill.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-pill.vue) | ✅ |
| 顶栏布局 | [`top-bar.vue`](../../../src/views/dashboard/drilldown/components/top-bar.vue) | ✅ Filter 左、Time 右、Refresh 仅 icon |
| filter CRUD / Prom match / SQL WHERE | [`src/observability/filters.ts`](../../../src/observability/filters.ts) | ✅ equality 进 Prom match；`isGreptimePromMatchSelector` |
| Label keys suggest | [`adapters/filter-options.ts`](../../../src/observability/adapters/filter-options.ts) | ✅ Prom `/labels`；无 `__name__` 时不带无效 match |
| Logs 列 value DISTINCT | 同上 + [`use-drilldown-filter-options.ts`](../../../src/observability/use-drilldown-filter-options.ts) | ✅ schema 缓存；label 输入不反复打 SQL |
| Backspace 回退 | combobox | ✅ value → operator → label；空 label 删最后一 pill |
| Placeholder | i18n | ✅ `+ label = value` / `label` / `=` / `value` |

**Filter 录入规则（已实现）**：

- Metrics label：Prom `/labels` suggest；**value 手输**（无 cross-metric Prom value API）
- Logs 列：`logsTable` + fieldMap 命中时 value 可 SQL DISTINCT
- 编辑已有 filter：**label 只读**；operator / value 可改
- `__name__` chip：不参与 PromQL matcher（R-FLT-4）

### Metrics 首页（目录）

| 能力 | 路径 | 状态 |
|------|------|------|
| 指标池 | [`use-metrics-catalog.ts`](../../../src/observability/use-metrics-catalog.ts) | ✅ `__name__/values` + time + match；`/series` fallback |
| Prefix / Suffix | [`metrics-sidebar.vue`](../../../src/views/dashboard/drilldown/metrics/metrics-sidebar.vue) + prefix/suffix tree | ✅ |
| 搜索 + Sort | [`main-toolbar.vue`](../../../src/views/dashboard/drilldown/metrics/main-toolbar.vue) | ✅ default（recent）/ A-Z / Z-A |
| 最近选中 | [`metrics/recent.ts`](../../../src/observability/metrics/recent.ts) | ✅ localStorage |
| 列表 UI | [`metric-chart-list.vue`](../../../src/views/dashboard/drilldown/metrics/metric-chart-list.vue) | ✅ 卡片网格 + lazy sparkline |
| 选中 metric | Select 按钮 → `ctx.metric` | ✅ 进入详情；**不**自动选第一项 |
| Group by 名前缀 | [`catalog.ts`](../../../src/observability/metrics/catalog.ts) `groupMetricNames` | ⬜ 代码支持 `groupBy: '__name__'`，**UI 未暴露**（URL 固定 `groupBy: none`） |
| 目录计数文案 | [`main-toolbar.vue`](../../../src/views/dashboard/drilldown/metrics/main-toolbar.vue) | ✅ total / filtered / loading |
| Lazy sparkline 卡片 | [`metric-sparkline.vue`](../../../src/views/dashboard/drilldown/metrics/metric-sparkline.vue) + [`use-metric-sparkline.ts`](../../../src/observability/use-metric-sparkline.ts) | ✅ IO + 并发队列 |
| 独立 Select 按钮 | [`metric-chart-card.vue`](../../../src/views/dashboard/drilldown/metrics/metric-chart-card.vue) | ✅ |

### Metric 详情（非首页，但已从列表进入）

| 能力 | 路径 | 状态 |
|------|------|------|
| 详情壳 | [`metric-detail.vue`](../../../src/views/dashboard/drilldown/metrics/metric-detail.vue) | ✅ Breakdown + Related logs tabs |
| Breakdown labels/values | [`breakdown-grid.vue`](../../../src/views/dashboard/drilldown/metrics/breakdown-grid.vue) | ✅ Prom API + match 含 `__name__` |
| Add to filter | label/value cards | ✅；**R-BRK-1**：label 仅 1 value 时仍 Add to filter |
| Related logs 预览 | [`related-logs-panel.vue`](../../../src/views/dashboard/drilldown/metrics/related-logs-panel.vue) | ✅ COUNT + 预览表；需 filters + logsTable |
| 主图 + query_range | — | ⬜ |
| inferPromQL（名启发式） | [`metrics/infer-promql.ts`](../../../src/observability/metrics/infer-promql.ts) | ✅ counter→rate、gauge→avg；⬜ `table_semantics` |
| Related metrics Tab | — | ⬜ |
| Open in PromQL | — | ⬜ |

### Logs 适配（部分，无 Logs 首页）

| 能力 | 路径 | 状态 |
|------|------|------|
| resolveLogsTable | [`logs/resolve-table.ts`](../../../src/observability/logs/resolve-table.ts) | ✅ mount 自动解析 |
| 默认 fieldMap | 同上 `buildDefaultLogsFieldMap` | ✅ |
| relatedLogsCount/Preview | [`adapters/logs.ts`](../../../src/observability/adapters/logs.ts) | ✅ |
| Logs 首页 volume | — | ⬜ |
| Settings UI | — | ⬜ |

### API

| 能力 | 路径 | 状态 |
|------|------|------|
| getMetricNames + match/start/end | [`src/api/metrics.ts`](../../../src/api/metrics.ts) | ✅ |
| getLabelNames / getLabelValues | 同上 | ✅ |
| METRIC_NAMES_LIMIT | 40000 | ✅ |

---

## 未实现 / 暂缓（相对规划）

### Metrics 首页待做（优先级）

1. **按 metric 名第一段分组** UI（`groupBy: '__name__'`，非 Group by labels）
2. **自动刷新** interval（spec A5）
3. Filter **op 完整化**（`!= =~ !~` 进 SQL WHERE / Prom 侧策略）

### Metrics 详情 / MVP 闭环

4. **table-semantics.ts** + inferPromQL `table_semantics` 层
5. **主时序图**（`query_range`）
6. Breakdown **mini 时序图**（非仅 value 列表）
7. **Related metrics**（Levenshtein）
8. **Open in metrics-query** 深链

### Phase 0 / 产品级

11. **Drilldown Settings** 页（logsTable、fieldMap、pinnedMetrics 持久化）
12. **Logs / Traces 首页**同屏（master Phase 1）
13. **focusTraceId** URL sync
14. **Bookmarks**（Phase 2）
15. **Group by labels** 侧栏 — Greptime API 阻塞，[confirmed-decisions](./confirmed-decisions.md) 已冻结不做

### Greptime 已知约束（已实现 workaround）

| 约束 | 实现 |
|------|------|
| `/label/{k}/values` 需 `match[]` 且含 `__name__` | 顶栏 Metrics value 手输；Breakdown 用 metric context |
| `/labels?match[]={仅 label filters}` 报错 | `fetchPromLabelKeys` 无 `__name__` 时不传 match |
| 无 Loki recording rule | Related logs 不看 metric 名 |

---

## 代码路径对照（文档勘误）

规划文档早期写法 → **当前仓库**：

| 规划 | 实际 |
|------|------|
| `src/views/dashboard/explore/` | `src/views/dashboard/drilldown/` |
| `/dashboard/explore` | `/dashboard/explore`（规划）→ **`/dashboard/drilldown`**（已上线路由） |
| sql-builder 式 filter 行 | Grafana combobox + pill（[`drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue)） |
| `src/observability/resolve-table.ts` | `src/observability/logs/resolve-table.ts` |
| `listMetrics(ctx)` | `fetchMetricNamesPool` + `useMetricsCatalog` |

---

## 相关文档

- 冻结决策：[confirmed-decisions.md](./confirmed-decisions.md)
- Phase 0 checklist：[phase0-checklist.md](./phase0-checklist.md)
- M/L 规则：[../architecture/metrics-vs-logs-drilldown-rules.md](../architecture/metrics-vs-logs-drilldown-rules.md)
- Metrics 规格（目标态）：[../plans/02-metrics-drilldown-spec.plan.md](../plans/02-metrics-drilldown-spec.plan.md)
