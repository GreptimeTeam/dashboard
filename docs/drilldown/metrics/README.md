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
| Breakdown | [`metrics/breakdown-grid.vue`](../../../src/views/dashboard/drilldown/metrics/breakdown-grid.vue) | ✅ label/value mini `query_range`（lazy + queue） |
| Prom API | [`src/api/metrics.ts`](../../../src/api/metrics.ts) | ✅ |
| Match / pool | [`adapters/metrics.ts`](../../../src/observability/adapters/metrics.ts) | ✅ |
| inferPromQL | [`metrics/infer-promql.ts`](../../../src/observability/metrics/infer-promql.ts) + [`resolve-metric-kind.ts`](../../../src/observability/resolve-metric-kind.ts) | ✅ 名启发式 + declared `table_semantics` |
| 类型语义 | [`table-semantics.ts`](../../../src/observability/table-semantics.ts) | ✅ metric.type / metadata_quality |
| 主图 vs mini 采样 | [`sparkline-step.ts`](../../../src/observability/metrics/sparkline-step.ts) | ✅ 主图 `MAIN_CHART_MAX_DATA_POINTS=500`（Grafana HIGH）；目录 mini `30` / heatmap `15`（Grafana list MEDIUM=250，我们更粗） |
| 主图轴密度 | [`use-metric-main-chart.ts`](../../../src/observability/use-metric-main-chart.ts) + [`chart-time-axis.ts`](../../../src/utils/chart-time-axis.ts) | ✅ 主图按实测宽高传 `plotWidthPx` / `plotHeightPx`；高度 `MAIN_CHART_HEIGHT=280`（Grafana XL）；目录仍默认 280 宽 + `splitNumber: 3` |
| 主图系列样式 | [`prom-chart.ts`](../../../src/observability/metrics/prom-chart.ts) `buildSparklineOption` / `buildMainTimeseriesOption` | ✅ 见下方「主图显示规则对照」 |
| 主图操作栏 | [`metric-detail-actions.vue`](../../../src/views/dashboard/drilldown/metrics/metric-detail-actions.vue) | ✅ 标题行右侧：Configure（caret）/ Explore / heatmap↔percentiles；brush→时间；偏好 localStorage |
| 高级出口 | [`src/views/dashboard/metrics/`](../../../src/views/dashboard/metrics/) | ✅ Explore → `/dashboard/metrics-query`（[`deep-links.ts`](../../../src/observability/deep-links.ts)） |

**路由**：`/dashboard/drilldown`（菜单名 Drilldown）。

---

## 主图显示规则对照（Grafana MetricGraphScene）

来源：`metrics-drilldown` `buildTimeseriesPanel` + Grafana core `defaultGraphConfig` / uPlot `showPoints: Auto`。

| 规则 | Grafana 主图 | Greptime 主图 | 状态 |
|------|--------------|---------------|------|
| 高度 | `PANEL_HEIGHT.XL` = 280（min；max 40%） | `MAIN_CHART_HEIGHT` = 280 | ✅ |
| 采样 | `QUERY_RESOLUTION.HIGH` → maxDataPoints **500** | `MAIN_CHART_MAX_DATA_POINTS` = 500 | ✅ |
| 线宽 | `lineWidth: 1` | `lineStyle.width: 1` | ✅ |
| 插值 | `lineInterpolation: Linear` | `smooth: false` | ✅ |
| 填充 | drilldown 覆盖 `fillOpacity: 9`（9%） | `SERIES_FILL_OPACITY = 0.09` | ✅ |
| 渐变 | `gradientMode: None` | 纯色 area | ✅ |
| 点 | 默认 `showPoints: Auto`（密度高时不画；uPlot 内置） | 主图显式 `showPoints: 'never'`（ECharts `auto` 仍会露点） | ✅ |
| 空洞 | `spanNulls: false`；缺样本由 query 省略 | `connectNulls: false` + `breakSparklineGaps` 插 null | ✅ |
| 色板 | classic palette index 0（单系列 fixed） | `getSeriesColorByIndex(0)` | ✅ |
| 单位 | `getUnit` / rate → per-second | `formatMetricAxisValue` / `getUnit` | ✅ |
| Legend | `showLegend: true`, placement **bottom** | 底部 query legend（PromQL 名 + 色块） | ≈ |
| Tooltip | 默认 single；groupBy 为 multi+desc | axis 单系列 tooltip | ≈ |
| X/Y 轴密度 | uPlot 按 plot CSS 宽高 | `plotWidthPx` / `plotHeightPx` → tick / splitNumber | ✅ |
| 多系列 / Configure | avg/sum/min-max/percentiles presets；groupBy 最多 20 条 | Configure：avg/sum/min_max；histogram heatmap↔percentiles（P99/90/50）；无 groupBy | ≈ |
| Crosshair sync | `CursorSync` Crosshair | 无 | ⬜ |
| 极值 NaN 重试 | `extremeValueFilterBehavior` | 无 | ⬜ |
| Heatmap | Spectral scheme、filter 空/零 bucket | Spectral-like + 相对阈值 | ≈ |
| Open in Explore | panel menu Explore | Explore → metrics-query | ✅ |
| Brush → time | VizPanel 拖选 zoom / 双击 zoom-out / X 轴拖平移 | [`raw-chart`](../../../src/components/raw-chart/) `timeInteraction`：底部 x 轴热区 pan + 图内 drag zoom；松手 emit `timeRangeChange` → `ctx.rangeTime` | ✅ |

目录 mini：采样更粗（30）、高度 168、`showPoints: Auto`（可露点）、轴默认 280 宽 / `splitNumber: 3`。

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

10. `inferPromQL` + 主图 `query_range` — **已完成**（含 Configure / Explore / percentiles / brush）
11. Breakdown mini 时序图 — **已完成**（label group-by + value 卡；tabs 全宽 `panel-tabs`）
12. ~~Open in metrics-query~~ — **已完成**

### Phase 2

- Related metrics（Levenshtein）
- Bookmarks
- Dashboard/Alert usage sort
- Group by **labels**（Greptime API 阻塞，不做）

---

## Grafana 参考

- [Metrics Drilldown 文档](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/metrics/)
- [metrics-drilldown 源码](https://github.com/grafana/metrics-drilldown) — 本机：`/tmp/metrics-drilldown`（见 [../README.md](../README.md)「Grafana 上游源码」）
- filter / time 共享规则：[../plans/03-grafana-drilldown-research.plan.md](../plans/03-grafana-drilldown-research.plan.md)
