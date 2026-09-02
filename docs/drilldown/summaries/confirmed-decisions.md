# Drilldown 已确认决策（冻结）

> 摘自 [product master](../plans/01-product-explore-master.plan.md) 与各专项 plan 讨论结论。  
> **布局类待定项不在此列。**

---

## 产品边界

| 决策 | 内容 |
|------|------|
| **产品** | 对标 Grafana Metrics + Logs + Traces Drilldown 的 **queryless** 关联观测 |
| **代号 / 路由** | Explore；`/dashboard/explore`（**一条新路由**） |
| **与 logs-query** | **不同产品**。logs-query = Logs Explore（SQL Builder），**不改造**；Drilldown 仅作「Open in SQL Explore」高级出口 |
| **与 Perses** | **解耦**。Explore 独立 Vue 产品；Perses = 固化看板 + Phase 2+ 深链 |
| **与 Grafana 差异** | **单 Context 同屏刷新** M/L/T，不做三个独立 App 互跳 |
| **不做** | 单独 `/logs-drilldown`；mito 自建表进 Metrics 目录；Loki recording rule 反解（Greptime 无 Loki） |

---

## 技术架构

### Correlation Context（单一状态源）

```ts
{
  timeRange: { from, to }
  filters: Array<{ key, op, value }>   // 跨 Metrics / Logs / Traces
  metric?: string
  focusTraceId?: string
  logsTable?: string
  tracesTable?: string
  fieldMap: { logs: Record<string,string>, traces: Record<string,string> }
}
```

- 变更 → 三信号 **adapters 重查、就地刷新**
- URL sync 与 Context 双向绑定

### 语义层（表 / 指标发现）

优先级：

1. `information_schema.table_semantics`（`signal_type`、`semantic_options.metric.type`）
2. `information_schema.columns.semantic_type` / `column_comment`
3. 列名 / 指标名启发式
4. 用户在 drilldown-settings 中覆盖

### 三信号取数原则

| 信号 | 权威数据源 | 首页加载 | 选中/下钻后 |
|------|------------|----------|-------------|
| **Metrics** | Prom `__name__/values`（ENGINE=metric） | 目录列表；**lazy** sparkline | `inferPromQL` → `query_range` |
| **Logs** | SQL on log 表 | `resolveLogsTable` → volume `GROUP BY` | 表 + filters SQL |
| **Traces** | SQL on trace 表 | 根 span 列表 | `focusTraceId` → Gantt |

### 跨信号关联（Greptime）

| 层级 | 键 | 实现 |
|------|-----|------|
| L1 | timeRange | Context 唯一时间源 |
| L2 | filters (labels) | Prom `match[]` + Logs/Traces SQL WHERE（**fieldMap** 映射列名） |
| L3 | trace_id | Logs/Traces 同 focusTraceId；Metrics→Trace **经 Logs**（MVP 无 exemplar） |

**Related logs（Greptime）**：不看 metric 名；需 `filters.length > 0` + fieldMap → SQL。

---

## Metrics 已确认规则（摘要）

完整版见 [metrics spec](../plans/02-metrics-drilldown-spec.plan.md)。

| 主题 | 结论 |
|------|------|
| **inferPromQL** | `table_semantics.metric.type` → 名启发式 → counter=`sum(rate)`，gauge=`avg`，histogram=`sum(rate(...)) by (le)` |
| **heatmap / percentiles** | 仅 **histogram** 类型；classic=`*_bucket`；主图可切 heatmap ↔ percentiles |
| **Select** | 三义：选 metric / 选 label / Add to filters（value）；Breakdown 有隐藏规则 |
| **Related metrics** | 全量列表 + **Levenshtein 排序**；非默认 prefix 过滤 |
| **Related logs** | filters → Loki selector（Grafana）；Greptime = fieldMap SQL |
| **Configure panel** | 仅主图 + Group-by 内 metric 卡；**不**含 Breakdown（`groupBy` panel 被排除） |
| **metric 名与 logs** | 一般**无关**；例外为 Loki recording rule 名（Greptime 不对标） |
| **Group by labels（侧栏）** | **Phase 0 不做**。Greptime Prom API 无法像 Grafana 一次拉全量 label values；UI 已移除 Group by 控件 |

### Greptime Prom API 能力缺口（Group by labels 阻塞项）

Grafana Metrics Drilldown 侧栏「Group by labels」依赖：

1. `GET /labels?match[]={__name__=~".+", filters…}` → 列出可分组 label 名
2. 选中 label 后 `GET /label/{k}/values?start=&end=`（**无 match**）→ 一次拉该 label 全量 values
3. 每个 value 再 `label_values({label=v, filters…}, __name__)` → 该组下的 metric 名

在 GreptimeDB（localhost:4000 实测）：

| API | Grafana 用法 | Greptime 结果 |
|-----|--------------|---------------|
| `GET /labels` | 无 match 或带 `__name__=~".+"` | 无 match ✅；`match[]={__name__=~".+"}` ❌（`__name__` 不支持 `=~`） |
| `GET /label/{k}/values` | 无 match，仅 start/end | ❌ **`match[]` 必填** |
| `GET /label/__name__/values?match[]={job="x"}` | 按 label value 查 metric 名 | ✅ 可行（Phase 2 备选：metric pool + 批量 match 或 `/series` 客户端分组） |

**结论**：无法「一次请求」拿到 catalog 级 label values；Group by labels 需 alternate value discovery，暂不在 Drilldown UI 暴露。

### Filter 录入（Greptime 适配，2026-09）

| 规则 | 内容 |
|------|------|
| **顶栏 UI** | sql-builder 式横向 `field \| op \| value` 行；**Metrics value 手输**（不做 cross-metric Prom value API 补全） |
| **Logs value 辅助** | `logsTable` + fieldMap 配置后，顶栏 value 可用 SQL `SELECT DISTINCT` |
| **Add to filter 主路径** | Breakdown label/value panel 卡 → `ctx.filters` |
| **R-BRK-1** | Breakdown label 卡仅 1 个 value 时仍显示 **Add to filter**（Greptime 偏离 Grafana 藏 Select） |
| **Related logs** | `timeRange` + `filters.length > 0` + `logsTable` + fieldMap SQL；**不看 metric 名** |

---

## Phase 划分（已对齐）

| Phase | 范围 | 布局是否阻塞 |
|-------|------|--------------|
| **0** | Context、URL、resolve 表、settings、metrics 列表壳、adapters 骨架 | **否** |
| **1** | L1/L2/L3 联动、三信号同屏刷新（布局定稿后接 UI） | 部分 |
| **2+** | Breakdown 完整 UI、Related、Bookmarks、Perses 深链、RED | 否 |

---

## Perses（已确认）

- **不**在 Perses plugin 内做 Drilldown 主 UI
- Phase 2+：Explore ↔ Perses **URL 深链**；可选导出 panel JSON
- 可复用：`traceLink` / Gantt modal（数据源改 Context）

---

## Logs 已确认规则（摘要）

完整版见 [logs spec](../plans/06-logs-drilldown-spec.plan.md)。

| 主题 | 结论 |
|------|------|
| **表发现** | `resolveLogsTable()`：URL/settings → `signal_type=log` → 列启发式；**不读** logs-query localStorage |
| **fieldMap** | time/body/severity/traceId/service + `primaryGroupBy`；settings 可覆盖 |
| **首页 volume** | SQL `date_bin` + `GROUP BY primaryGroupBy`（对标 Loki index/volume） |
| **Select service** | 写入 Context `filters`（非独立路由） |
| **Labels breakdown** | TAG 列 `GROUP BY` + Add to filters；Phase 2 |
| **trace_id** | → `focusTraceId`（L3） |
| **Related logs（来自 Metrics）** | 需 `filters.length > 0` + fieldMap SQL |
| **Select 模型** | 以 Add filter 为主；无 Metrics 式 Select 三义 |
| **Breakdown 图** | Count = 各 value 条数时序；Avg = 数值列均值 |
| **不做** | Loki/LogQL、patterns API、recording rule 反查 |

---

## Metrics vs Logs 公共实现

完整对照：[metrics-vs-logs-drilldown-rules.md](../architecture/metrics-vs-logs-drilldown-rules.md)

| 共用 | 分离 |
|------|------|
| Context、filters[]、filter-bar、timeRange 全刷新 | Prom 目录 vs SQL volume |
| Add to filters、focusTraceId、deep-links | Select 三义（M）vs service 卡（L） |
| lazy 网格、breakdown volume 图、Bookmarks | inferPromQL vs 日志 SELECT / field 发现 |

---

## 待写 spec（未阻塞 Phase 0）

- [x] `plans/06-logs-drilldown-spec.plan.md`
- [ ] `plans/07-traces-drilldown-spec.plan.md`
- [x] Prom API capability 探测（Group by labels 阻塞项见上文「Greptime Prom API 能力缺口」）
