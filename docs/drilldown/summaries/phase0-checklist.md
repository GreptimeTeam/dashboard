# Phase 0 Checklist（Explore 基建）

> 与布局无关，可先于 UI 定稿实施。详见 [product master](../plans/01-product-explore-master.plan.md)。

---

## 目标

交付可运行的 `/dashboard/explore` **最小壳**：Context 驱动、表解析、settings、Metrics 列表 adapter 骨架；Logs/Traces adapter 接口就绪。

---

## 模块清单

| # | 模块 | 路径（建议） | 交付物 |
|---|------|--------------|--------|
| 1 | Context store | `src/observability/context.ts` | `timeRange`, `filters`, `metric`, `focusTraceId`, URL sync |
| 2 | 表解析 | `src/observability/resolve-table.ts` | `resolveLogsTable()`, `resolveTracesTable()` |
| 3 | 语义层 | `src/observability/table-semantics.ts` | 读 `table_semantics` + column `semantic_type` |
| 4 | fieldMap | `src/observability/field-map.ts` | Prom label → logs/traces 列映射 |
| 5 | Settings | `src/observability/drilldown-settings.ts` + 设置 UI | 持久化 logs 表、fieldMap、traces 表 |
| 6 | Metrics adapter | `src/observability/adapters/metrics.ts` | `listMetrics(ctx)`, `buildMatchSelector`, `inferPromQL` |
| 7 | Logs adapter | `src/observability/adapters/logs.ts` | `canShowRelatedLogs`, `buildLogsWhere`, `relatedLogsPreview`（接口） |
| 8 | Traces adapter | `src/observability/adapters/traces.ts` | 根 span 列表 SQL（接口） |
| 9 | Explore shell | `src/views/dashboard/explore/` | 路由 + 空布局 + Context provider |
| 10 | Prom API 扩展 | `src/api/metrics.ts` | `getMetricNames({ start, end, match })` + capability 探测 |

---

## 前置探测（Phase 0 第 1 周）

- [ ] 脚本验证 Greptime Prom API：`__name__/values` 是否支持 `match[]`、`start`、`end`
- [ ] 不支持时 document fallback：`/series` 去重 + 客户端 filter
- [ ] 抽样验证 `information_schema.table_semantics` 可读性与 `metric.type` 覆盖

---

## Definition of Done

- [ ] 访问 `/dashboard/explore` 可见 shell（时间选择 + 空三信号区或占位）
- [ ] 修改 URL / timeRange / filters → Context 更新并可序列化回 URL
- [ ] `resolveLogsTable()` 在至少一种场景（settings / semantics / 启发式）返回表名
- [ ] Metrics 列表可拉 `__name__/values`（带 timeRange；match 按 capability）
- [ ] **未**要求：完整 Breakdown UI、布局定稿、Logs volume 首页

---

## 复用现有代码

| 组件 | 路径 |
|------|------|
| Log 表格 | `src/views/dashboard/logs/query/LogsTable.vue` |
| Trace Gantt | `src/views/dashboard/traces/` |
| PromQL range | `src/api/metrics.ts` → `executePromQLRange` |
| 时间选择 | 现有 TimeRange 组件 |

---

## Phase 0 之后

| Phase | 依赖 Phase 0 | 见 |
|-------|--------------|-----|
| 1 | Context + adapters | Master §Phase 1 联动 |
| Metrics MVP | inferPromQL + Select + 主图 | [metrics spec](../plans/02-metrics-drilldown-spec.plan.md) |
| Logs/Traces MVP | resolve 表 + fieldMap | 待写 logs/traces spec |
