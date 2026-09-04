# Phase 0 Checklist（Explore 基建）

> 与布局无关，可先于 UI 定稿实施。详见 [product master](../plans/01-product-explore-master.plan.md)。  
> **实现进度**见 [implementation-status.md](./implementation-status.md)（2026-09-02 起以代码为准）。

---

## 目标

交付可运行的 Drilldown **最小壳**：Context 驱动、表解析、Metrics 列表 + filter；Logs adapter 部分就绪。**当前路由**：`/dashboard/drilldown`。

---

## 模块清单

| # | 模块 | 路径（实际） | 状态 |
|---|------|--------------|------|
| 1 | Context store | [`src/observability/context.ts`](../../../src/observability/context.ts) | ✅ |
| 2 | 表解析（Logs） | [`src/observability/logs/resolve-table.ts`](../../../src/observability/logs/resolve-table.ts) | ✅ `resolveLogsTable`, `buildDefaultLogsFieldMap` |
| 3 | 语义层 | `src/observability/table-semantics.ts` | ⬜ 未建 |
| 4 | fieldMap | [`src/observability/types.ts`](../../../src/observability/types.ts) + logs init | ✅ 内存 + URL `logsTable`；无 Settings UI |
| 5 | Settings | `drilldown-settings` + 设置 UI | ⬜ |
| 6 | Metrics adapter | [`src/observability/adapters/metrics.ts`](../../../src/observability/adapters/metrics.ts) | ✅ pool + match selector；⬜ 完整 `inferPromQL` |
| 7 | Logs adapter | [`src/observability/adapters/logs.ts`](../../../src/observability/adapters/logs.ts) | ✅ related logs；⬜ volume 首页 |
| 8 | Traces adapter | `src/observability/adapters/traces.ts` | ⬜ |
| 9 | Explore shell | [`src/views/dashboard/drilldown/`](../../../src/views/dashboard/drilldown/) | ✅ |
| 10 | Prom API 扩展 | [`src/api/metrics.ts`](../../../src/api/metrics.ts) | ✅ `getMetricNames({ start, end, match })` + series fallback |
| 11 | URL sync | [`src/observability/use-drilldown-url-sync.ts`](../../../src/observability/use-drilldown-url-sync.ts) | ✅ |
| 12 | Filter 顶栏 | [`components/drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue) | ✅ Grafana combobox |

---

## 前置探测（Prom API）

- [x] Greptime：`GET /labels` 无 match 可用
- [x] Greptime：`GET /label/{k}/values` **必须** `match[]`，且需含 `__name__`
- [x] Greptime：`GET /label/__name__/values?match[]={job="x"}` 可用
- [x] 结论写入 [confirmed-decisions.md](./confirmed-decisions.md)「Greptime Prom API 能力缺口」
- [ ] 正式 capability 脚本入库（可选）

---

## Definition of Done（Phase 0 Metrics 壳）

- [x] 访问 `/dashboard/drilldown` 可见 shell（时间 + filter + Metrics 侧栏 + 列表）
- [x] 修改 URL / timeRange / filters → Context 更新并可序列化回 URL
- [x] `resolveLogsTable()` 在 mount 时自动解析（semantics / 启发式）
- [x] Metrics 列表拉 `__name__/values`（带 timeRange；match 按 Greptime 规则）
- [x] 顶栏 filter：Grafana 式 combobox + Breakdown Add to filter
- [x] 选中 metric → Breakdown + Related logs（无主图）
- [ ] **未**要求且**未**完成：lazy sparkline 网格、完整 Breakdown 图、Logs volume 首页、Settings UI、Traces

---

## 复用现有代码

| 组件 | 路径 |
|------|------|
| Log 表格 | `src/views/dashboard/logs/query/LogsTable.vue` |
| Trace Gantt | `src/views/dashboard/traces/` |
| PromQL range | `src/api/metrics.ts` → `executePromQLRange` |
| 时间选择 | `src/components/time-range-select/index.vue` |

---

## Phase 0 之后

| Phase | 依赖 | 见 |
|-------|------|-----|
| Metrics 首页补全 | sparkline + Select + 计数 | [implementation-status.md](./implementation-status.md) |
| Metrics MVP 闭环 | inferPromQL + 主图 | [metrics spec](../plans/02-metrics-drilldown-spec.plan.md) |
| Phase 1 | L1/L2/L3 三信号同屏 | Master §Phase 1 |
| Logs/Traces MVP | volume 首页 + fieldMap settings | [06-logs spec](../plans/06-logs-drilldown-spec.plan.md) |
