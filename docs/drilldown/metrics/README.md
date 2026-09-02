# Metrics Drilldown 文档

## 完整规格

[../plans/02-metrics-drilldown-spec.plan.md](../plans/02-metrics-drilldown-spec.plan.md)

包含：

- 功能清单 A–F（目录 / Select / inferPromQL / Breakdown / Related / 边界）
- Greptime 每项取数对照
- **Select 按钮规则**（metric / label / Add to filters）
- **Related metrics**（Levenshtein 排序，非 prefix 硬过滤）
- **Related logs**（filters + fieldMap；无 Loki recording rule）
- **Configure panel** 作用域（不含 Breakdown groupBy 面板）
- **Histogram** → heatmap / percentiles 条件
- **inferPromQL** 类型判定优先级

## Greptime 代码落点

| 职责 | 路径 |
|------|------|
| Prom API | [`src/api/metrics.ts`](../../../src/api/metrics.ts) |
| 列表 / inferPromQL | `src/observability/adapters/metrics.ts`（待建） |
| 类型语义 | `src/observability/table-semantics.ts`（待建） |
| Explore UI | `src/views/dashboard/explore/`（待建） |
| 高级出口 | [`src/views/dashboard/metrics/`](../../../src/views/dashboard/metrics/) |

## MVP 优先级

1. `__name__/values` + filters + timeRange
2. 网格 lazy sparkline + Select
3. `inferPromQL` + 主图
4. Breakdown labels → values → Add to filters
5. Phase 2：Related metrics / Related logs / Configure / Bookmarks

## Grafana 参考

- [Metrics Drilldown 文档](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/metrics/)
- [metrics-drilldown 源码](https://github.com/grafana/metrics-drilldown)
