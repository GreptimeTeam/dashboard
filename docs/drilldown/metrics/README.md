# Metrics Drilldown 文档

## 实现状态（先看这个）

**[../summaries/implementation-status.md](../summaries/implementation-status.md)** — 以当前代码为准的模块清单、已完成 / 待做、Greptime 约束。

---

## 完整规格（目标态）

[../plans/02-metrics-drilldown-spec.plan.md](../plans/02-metrics-drilldown-spec.plan.md)

包含：

- 功能清单 A–F（目录 / Select / inferPromQL / Breakdown / Related / 边界）
- Greptime 每项取数对照
- **Select 按钮规则**（metric / label / Add to filters）
- **Related metrics**（Levenshtein 排序）
- **Related logs**（filters + fieldMap）
- **Histogram** → heatmap / percentiles 条件

---

## Greptime 代码落点（当前）

| 职责 | 路径 | 状态 |
|------|------|------|
| 页面壳 | [`src/views/dashboard/drilldown/index.vue`](../../../src/views/dashboard/drilldown/index.vue) | ✅ |
| 顶栏 filter | [`components/drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue) | ✅ |
| 侧栏 prefix/suffix | [`metrics/metrics-sidebar.vue`](../../../src/views/dashboard/drilldown/metrics/metrics-sidebar.vue) | ✅ |
| 首页列表 | [`metrics/metric-chart-list.vue`](../../../src/views/dashboard/drilldown/metrics/metric-chart-list.vue) | ✅ lazy sparkline 卡片网格 |
| 目录数据 | [`use-metrics-catalog.ts`](../../../src/observability/use-metrics-catalog.ts) | ✅ |
| Breakdown | [`metrics/breakdown-grid.vue`](../../../src/views/dashboard/drilldown/metrics/breakdown-grid.vue) | ✅ 列表卡，无 mini 图 |
| Prom API | [`src/api/metrics.ts`](../../../src/api/metrics.ts) | ✅ |
| Match / pool | [`adapters/metrics.ts`](../../../src/observability/adapters/metrics.ts) | ✅ |
| inferPromQL | [`metrics/infer-promql.ts`](../../../src/observability/metrics/infer-promql.ts) | ✅ 名启发式；⬜ `table_semantics` |
| 类型语义 | `table-semantics.ts` | ⬜ 未建 |
| 高级出口 | [`src/views/dashboard/metrics/`](../../../src/views/dashboard/metrics/) | ⬜ 深链未接 |

**路由**：`/dashboard/drilldown`（菜单名 Drilldown）。

---

## MVP 优先级（更新于 2026-09-02）

### 已完成

1. `__name__/values` + filters + timeRange + prefix/suffix
2. 顶栏 Grafana filter combobox + URL sync
3. 搜索、A-Z / 最近选中 sort
4. 点击 metric → 详情；Breakdown labels/values → Add to filters
5. Related logs 预览（filters + logsTable）
6. Greptime Prom API workaround（match / value suggest）

### 待做（首页）

7. Lazy sparkline 指标卡片 + Select 按钮 — **已完成**
8. 目录 total/filtered 计数 UI — **已完成**
9. 可选：按 metric 名前缀分组（`groupBy: '__name__'`）

### 待做（详情 / MVP 闭环）

10. `inferPromQL` + 主图 `query_range`
11. Breakdown mini 时序图
12. Open in metrics-query

### Phase 2

- Related metrics（Levenshtein）
- Bookmarks
- Dashboard/Alert usage sort
- Group by **labels**（Greptime API 阻塞，不做）

---

## Grafana 参考

- [Metrics Drilldown 文档](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/metrics/)
- [metrics-drilldown 源码](https://github.com/grafana/metrics-drilldown)
