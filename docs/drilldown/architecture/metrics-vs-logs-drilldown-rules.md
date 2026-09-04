# Metrics vs Logs Drilldown 规则对照与公共实现

> 汇总 [02-metrics](../plans/02-metrics-drilldown-spec.plan.md) 与 [06-logs](../plans/06-logs-drilldown-spec.plan.md) 的**可执行规则**，并标出 Explore 内 **可共用模块**。
>
> Traces 专项见待写 `07-traces-drilldown-spec`；本文仅 M/L。

---

## 一、统一产品规则（Explore 公共层）

以下规则 **Metrics / Logs 共用**，应落在 `src/observability/` 与 Explore shell，**不要**各写一套。

### 1.1 Correlation Context（唯一状态源）

```ts
type DrilldownContext = {
  timeRange: { from: number; to: number }  // unix ms 或 ISO，实现统一
  filters: Array<{ key: string; op: '=' | '!=' | '=~' | '!~'; value: string }>
  metric?: string           // Metrics 选中项
  focusTraceId?: string     // L3 关联
  logsTable?: string
  tracesTable?: string
  fieldMap: {
    logs: Record<string, string>    // chip key → SQL 列名
    traces: Record<string, string>
    metrics?: Record<string, string> // Prom label 别名（通常与 filters.key 一致）
  }
}
```

| 规则 | 说明 |
|------|------|
| **R-CTX-1** | 顶栏 timeRange + filters 为 **三信号唯一输入**；任一变更 → 订阅 adapter **debounce 重查** |
| **R-CTX-2** | URL ↔ Context **双向同步**（分享、刷新可恢复） |
| **R-CTX-3** | filters 多条件 **AND**；op 支持 `=` / `!=` / `=~` / `!~` |
| **R-CTX-4** | chip 展示用 **统一 key**（如 `service`）；各 adapter 经 **fieldMap** 映射到物理列 / Prom label |
| **R-CTX-5** | `focusTraceId` 变更 → Traces Gantt + Logs 可选按 trace 过滤；**不**自动改 filters（除非用户点 trace_id） |

### 1.2 Filter 栈（Add to filters）

| 规则 | 说明 |
|------|------|
| **R-FLT-1** | **Add to filters** = 向 `ctx.filters` 追加 `{ key, op, value }`，触发全局刷新 |
| **R-FLT-2** | 同一 `key+op+value` 重复追加应 **去重** |
| **R-FLT-3** | chip 上 × 删除单条；Reset 清空 filters（可保留 Logs 的 primaryGroupBy，产品可配置） |
| **R-FLT-4** | Metrics：`__name__` 仅用于 **缩窄指标列表**，**不**写入 PromQL matcher（Grafana #235） |
| **R-FLT-5** | Logs/Metrics 跨信号：同一 filter chip → Prom `match[]` **与** SQL WHERE **并行生效** |
| **R-FLT-6** | 顶栏 filter UI：**Grafana combobox**（pill + 分阶段 suggest）；Metrics value **手输** |
| **R-FLT-7** | Logs：`logsTable` 配置后顶栏 value 可用 SQL `DISTINCT`；label keys 走 Prom `/labels`（无 `__name__` 时不传 match） |
| **R-BRK-1** | Breakdown label 卡 `series===1`（仅 1 个 value）仍提供 **Add to filter**（Greptime 偏离 Grafana） |

**公共模块**：`src/observability/context.ts`（filters CRUD）、`src/observability/filters.ts`（`addFilter` / `removeFilter` / `filtersToPromMatch` / `filtersToSqlWhere`）

### 1.3 时间与刷新

| 规则 | 说明 |
|------|------|
| **R-TIME-1** | 默认相对窗 **15m**（与 master plan 一致） |
| **R-TIME-2** | Time picker 变更 → 列表 + 详情 + breakdown **全部重拉** |
| **R-TIME-3** | 图表 brush/zoom（count-chart）→ 写回 `ctx.timeRange` |
| **R-TIME-4** | Refresh：手动 + 可选自动间隔；Live poll **Phase 2**（Logs 可复用 logs-query 3s） |

**公共模块**：复用 [TimeRangeSelect](src/components/time-range-select/index.vue)、[useTimeRange](src/hooks/use-time-range.ts)；Explore 包装 `useDrilldownTimeRange(ctx)`

### 1.4 首页 / 目录行为

| 规则 | Metrics | Logs |
|------|---------|------|
| **R-HOME-1 不自动选中第一项** | ✓ 等用户 Select metric | ✓ 等用户点 service 卡片 |
| **R-HOME-2 Lazy 卡片** | 滚入才 `query_range` sparkline | 滚入才 per-service volume + 预览行 |
| **R-HOME-3 搜索** | 客户端 / `__name__=~` | 客户端 filter service 名 |
| **R-HOME-4 Recent** | localStorage 最近 metric 置顶 | localStorage 最近 service 置顶 |

**公共模块**：`useLazyPanelQuery(IntersectionObserver)`、`useRecentItems(storageKey)`

### 1.5 Breakdown 图表语义（Labels / Fields / Metric labels 共用）

| 模式 | 含义 | Metrics | Logs |
|------|------|---------|------|
| **Count / Volume** | 某维度 **各取值** 在单位时间内的 **日志条数 / sample 数** | `sum by (label) (rate(...))` 或 count | `date_bin + GROUP BY col, COUNT(*)` |
| **Avg** | 数值维度的 **平均值** 随时间 | `avg_over_time` / unwrap | `date_bin + AVG(col)` |
| **不是占比 %** | 除非单独算 ratio | — | — |

**公共模块**：`BreakdownVolumeChart.vue`（包装 count-chart / 时序堆叠柱）、`buildVolumeSql` / `buildPromBreakdownExpr` 分 adapter 注入

### 1.6 高级出口

| 信号 | 规则 | 目标 |
|------|------|------|
| **R-EXIT-M** | Open in PromQL Explore | `/dashboard/metrics?promql=...` |
| **R-EXIT-L** | Open in SQL Explore | `/dashboard/logs-query?builderForm=...` |
| **R-EXIT-*** | 深链携带 **当前 Context** 子集（time + filters + 选中项） | 各页 URL sync |

**公共模块**：`src/observability/deep-links.ts`（`contextToMetricsUrl` / `contextToLogsQueryUrl`）

### 1.7 跨信号（L1/L2/L3）

| 层级 | 键 | 公共行为 |
|------|-----|----------|
| L1 | timeRange | 唯一时间源 |
| L2 | filters | fieldMap 映射后同时收窄 M/L/T |
| L3 | trace_id | `focusTraceId`；Metrics→Trace **MVP 经 Logs**，无 exemplar |

**公共模块**：Context 已有；`src/observability/adapters/index.ts` 编排并行 refresh

---

## 二、Metrics Drilldown 专有规则

> 详表见 [02-metrics-drilldown-spec](../plans/02-metrics-drilldown-spec.plan.md)

### 2.1 数据边界

| 规则 | 内容 |
|------|------|
| **M-BND-1** | 目录权威来源：Prom `GET .../label/__name__/values`（+ start/end/match） |
| **M-BND-2** | `ENGINE=mito` 自建表 **不进** 目录；仅 Prom/OTLP metric 逻辑表 |
| **M-BND-3** | 未 Select metric 时 **禁止** 全库 `query_range` |

### 2.2 首页目录

| 规则 | 内容 |
|------|------|
| **M-LST-1** | 列表受 timeRange + filters（match[]）约束 |
| **M-LST-2** | prefix/suffix/search：**客户端**或 `__name__=~` |
| **M-LST-3** | Sort：A-Z / 最近选中；Dashboard usage **Phase 2+** |
| **M-LST-4** | Related metrics：**全量池 + Levenshtein 排序**，非默认 prefix 硬过滤 |

### 2.3 Select 三义（Metrics **独有**，必须分场景）

| 按钮 | 位置 | 效果 |
|------|------|------|
| **Select** | 指标网格 / Related | `ctx.metric = name` → inferPromQL + 主图 |
| **Select** | Breakdown **label** 卡 | 进入该 label 的 **value 列表** |
| **Add to filters** | Breakdown **value** 卡 | `filters += { label, '=', value }` |

| 规则 | 内容 |
|------|------|
| **M-SEL-1** | 主图区 **无** Select；用「Select new metric」换指标 |
| **M-SEL-2** | label 卡：仅 1 条 series → **隐藏** Select（Grafana 规格） |
| **M-SEL-2′** | **已实现偏离**：Greptime 按 **R-BRK-1** 显示 Add to filter，不隐藏 |
| **M-SEL-3** | value 卡：数据点 < 2 / `<unspecified>` / binary ratio → **无** Add to filters |

### 2.4 单指标详情

| 规则 | 内容 |
|------|------|
| **M-DET-1** | `inferPromQL`：table_semantics.metric.type → 启发式 → counter=`sum(rate)`，gauge=`avg`，histogram=`sum(rate(...)) by (le)` |
| **M-DET-2** | heatmap / percentiles **仅 histogram**；Configure panel **不含** Breakdown groupBy 面板 |
| **M-DET-3** | matchers = Context filters（**不含** `__name__`） |

### 2.5 Related logs（Metrics 页触发，Logs adapter 执行）

| 规则 | 内容 |
|------|------|
| **M-RL-1** | 前置：`ctx.filters.length > 0` + `resolveLogsTable()` |
| **M-RL-2** | **不看** metric 名（无 Loki recording rule） |
| **M-RL-3** | fieldMap 映射 filters → SQL COUNT + LIMIT 100 预览 |

---

## 三、Logs Drilldown 专有规则

> 详表见 [06-logs-drilldown-spec](../plans/06-logs-drilldown-spec.plan.md)

### 3.1 数据边界

| 规则 | 内容 |
|------|------|
| **L-BND-1** | 必须先 `resolveLogsTable()`：**单表** MVP；多候选需用户选 |
| **L-BND-2** | **不读** logs-query localStorage；Explore 自有 settings |
| **L-BND-3** | 排除 `ENGINE=metric`；校验 TIMESTAMP + body/message |
| **L-BND-4** | 首页 = **一张表**内按 `primaryGroupBy` 分组，非多表并列 |

### 3.2 首页 Overview

| 规则 | 内容 |
|------|------|
| **L-HOM-1** | volume 对标 Loki index/volume：`GROUP BY primaryGroupBy` + `COUNT(*)` |
| **L-HOM-2** | `primaryGroupBy` 默认 `service_name` → `scope_name` → 无则「All logs」单卡片 |
| **L-HOM-3** | 点 service 卡片 = **`filters += { primaryGroupBy, '=', value }`**（不是单独路由） |
| **L-HOM-4** | 总 volume 时序 + lazy per-service 时序/预览 |

### 3.3 详情页（Service / 过滤后日志）

| 规则 | 内容 |
|------|------|
| **L-DET-1** | 绑定表 + fieldMap 后 **自动** SELECT，无需 Run |
| **L-DET-2** | 日志表 LIMIT 500；Phase 2 时间分页 |
| **L-DET-3** | body 全文；Phase 2 default columns 按 service 规则 |

### 3.4 Labels vs Fields

| 概念 | Greptime 来源 | Tab |
|------|---------------|-----|
| **Labels** | `semantic_type=TAG` + settings | Labels Tab |
| **Fields** | 标量 FIELD 列 + JSON keys + body 解析 | Fields Tab |

| 规则 | 内容 |
|------|------|
| **L-LBL-1** | Labels breakdown：`GROUP BY` TAG 列 + volume 图（Count 模式） |
| **L-FLD-1** | Fields 发现：L0 settings → L1 schema 标量 → L2 JSON 采样 → L3 body 解析 |
| **L-FLD-2** | 字符串 field 图 = **各 value 的 COUNT 时序**；数值 field = **AVG 时序** |
| **L-FLD-3** | 高基数（distinct > 500 或 trace_id 类）→ 隐藏 value breakdown |

### 3.5 Select / 交互（Logs **无** Metrics 式三步 Select）

| 交互 | 效果 | 对标 Metrics |
|------|------|--------------|
| 点 service 卡片 | Add filter（primaryGroupBy） | ≈ Add to filters（非 Select metric） |
| Labels/Fields value 条 | Add to filters | = **M-SEL Add to filters** |
| 表 cell 右键 | Add to filters |  Logs 独有 |
| 点 trace_id | `focusTraceId` | L3，Metrics 无直接等价 |
| Fields Tab Select | 进入 **单 field 的 value breakdown** | ≈ **M-SEL Select label** |

| 规则 | 内容 |
|------|------|
| **L-SEL-1** | Logs **没有**「Select metric」；**没有**全局 Select 三义组件混用 |
| **L-SEL-2** | 「Select」在 Fields/Labels 上 = 进入 **value 列表视图**（可选实现，Phase 2） |
| **L-SEL-3** | 默认主路径：**Add to filters** 比 Select 更常用 |

### 3.6 不做

| 规则 | 内容 |
|------|------|
| **L-NO-1** | 无 Loki / LogQL / index/volume API |
| **L-NO-2** | 无 recording rule 反查 |
| **L-NO-3** | Patterns 聚类 Phase 2+ 或跳过 |

---

## 四、规则对照总表

| 维度 | Metrics Drilldown | Logs Drilldown | 可统一？ |
|------|-------------------|----------------|---------|
| **状态** | Context + `metric?` | Context + `logsTable` + fieldMap | ✓ Context 层 |
| **首页实体** | metric 名列表 | service（primaryGroupBy）卡片 | ✗ 数据源不同；✓ lazy 网格 UI |
| **首页 API** | Prom `__name__/values` | SQL `GROUP BY` volume | ✗ adapter 不同 |
| **进入详情** | Select **metric** | Add filter **service** | ✗ 交互名不同；✓ 都写 Context |
| **顶栏 filters** | Prom `match[]` | SQL WHERE | ✓ 同一 `filters[]` + 映射函数 |
| **Breakdown 维度** | metric 的 Prom labels | TAG 列 + Fields | ✗ 发现逻辑不同；✓ 图表组件 |
| **Breakdown 图** | rate/count by label value | COUNT by col value | ✓ Count volume 语义 |
| **Add to filters** | Breakdown value 卡 | Label/Field/value/cell | ✓ **同一 filter CRUD** |
| **Select 语义** | 3 种（metric/label/—） | 0~1 种（field value 视图） | △ 统一 **Action 枚举**，分 signal 挂载 |
| **主详情** | 时序主图 + inferPromQL | 日志行表 | ✗ |
| **关联 trace** | 经 Related logs / exemplar× | trace_id → focusTraceId | ✓ focusTraceId |
| **Related 跨信号** | Related logs（要 filters） | （被 Metrics 消费） | ✓ logs adapter |
| **高级出口** | metrics-query | logs-query | ✓ deep-links 模式 |
| **Bookmarks** | Phase 2 | Phase 2 | ✓ 同一 storage 结构 |
| **不自动选第一项** | ✓ | ✓ | ✓ |
| **时间驱动全刷新** | ✓ | ✓ | ✓ |

---

## 五、公共实现清单（建议模块）

> **2026-09-02**：下列「实际路径」以仓库为准；完整状态见 [implementation-status.md](../summaries/implementation-status.md)。

```text
src/observability/                          # 状态见 implementation-status
├── context.ts                 # ✅ R-CTX-*：store + provide/inject
├── filters.ts                 # ✅ R-FLT-*：add/remove/toProm/toSql + Greptime match 守卫
├── types.ts                   # ✅ FilterOp, FieldMap, SidebarFilters
├── use-drilldown-url-sync.ts  # ✅
├── use-drilldown-filter-options.ts  # ✅
├── use-drilldown-logs-init.ts       # ✅
├── use-metrics-catalog.ts           # ✅
├── logs/resolve-table.ts      # ✅ resolveLogsTable / default fieldMap
├── metrics/
│   ├── catalog.ts             # ✅ pool + prefix/suffix/groupBy 逻辑
│   ├── breakdown.ts           # ✅ labels/values；⬜ inferPromQL stub
│   ├── prefix-tree.ts / suffix-tree.ts / recent.ts  # ✅
├── table-semantics.ts         # ⬜
├── drilldown-settings.ts      # ⬜
├── deep-links.ts              # ⬜
└── adapters/
    ├── metrics.ts             # ✅ pool / match
    ├── logs.ts                # ✅ related logs；⬜ volume
    ├── filter-options.ts      # ✅ Prom keys + SQL DISTINCT
    └── traces.ts              # ⬜

src/views/dashboard/drilldown/   # 路由 /dashboard/drilldown
├── index.vue                  # ✅
├── components/
│   ├── top-bar.vue            # ✅
│   ├── filter-bar.vue         # ✅
│   ├── drilldown-filter-combobox.vue  # ✅ Grafana combobox（非 sql-builder 行）
│   └── drilldown-filter-pill.vue      # ✅
└── metrics/
    ├── metrics-sidebar.vue    # ✅ prefix/suffix
    ├── metric-name-list.vue   # ✅ 文字网格（⬜ sparkline）
    ├── metric-detail.vue      # ✅ Breakdown + Related logs（⬜ 主图）
    └── breakdown-grid.vue     # ✅ Add to filter
```

### 5.1 最值得复用的 5 块

| # | 模块 | 服务的规则 | Metrics | Logs |
|---|------|-----------|---------|------|
| 1 | **Context + filters.ts** | R-CTX, R-FLT | match[] | SQL WHERE |
| 2 | **filter combobox**（[`drilldown-filter-combobox.vue`](../../../src/views/dashboard/drilldown/components/drilldown-filter-combobox.vue)） | R-FLT-1~7 | ✅ | ✅（Logs DISTINCT 待 Settings） |
| 3 | **breakdown volume 图** | Count/Avg 语义 | ⬜ 列表卡 only | ⬜ |
| 4 | **useLazyPanelQuery** | R-HOME-2 | ⬜ sparkline | ⬜ service 卡 |
| 5 | **deep-links.ts** | R-EXIT | ⬜ | ⬜ |

### 5.2 不应强行统一的块

| 模块 | 原因 |
|------|------|
| 首页列表数据源 | Prom API vs SQL |
| Select 三义完整 UI | Metrics 必须分场景；Logs 以 Add filter 为主 |
| inferPromQL | Metrics 独有 |
| resolveLogsTable + field discovery | Logs 独有 |
| 主详情面板 | 时序图 vs LogTable |

### 5.3 统一 Action 模型（推荐）

避免 Metrics/Logs 各写一套按钮逻辑：

```ts
type DrilldownAction =
  | { type: 'select_metric'; metric: string }
  | { type: 'select_dimension'; signal: 'metrics'|'logs'; dimension: string }  // metric label / log label / field
  | { type: 'add_filter'; key: string; op: FilterOp; value: string }
  | { type: 'focus_trace'; traceId: string }
  | { type: 'reset_filters'; keepPrimary?: boolean }

function applyDrilldownAction(ctx, action): void {
  // 统一写 Context + emit refresh
}
```

| Action | Metrics 挂载点 | Logs 挂载点 |
|--------|----------------|-------------|
| `select_metric` | 指标网格 | — |
| `select_dimension` | Breakdown label 卡 | Fields Tab Select（Phase 2） |
| `add_filter` | Breakdown value 卡 | service 卡 / label value / table cell |
| `focus_trace` | — | trace_id 列 |

---

## 六、下钻路径对照（用户心智）

```text
Metrics:
  目录 → Select metric → 主图
       → Select label → value 列表 → Add to filters
       → Related metrics (换 metric)
       → Related logs (要 filters)

Logs:
  Overview → 点 service (= Add filter) → 日志表
          → Labels Tab → Add to filters
          → Fields Tab → (Select field →) Add to filters
          → trace_id → focusTraceId

公共：任何 Add to filters → 三信号同屏刷新（Explore 差异于 Grafana 三 App）
```

---

## 七、Phase 与公共基建顺序

| Phase | 公共（M+L） | Metrics 专有 | Logs 专有 |
|-------|-------------|--------------|-----------|
| **0** | Context, URL, filters.ts, field-map, settings shell | listMetrics 壳 | resolveLogsTable 壳 |
| **1** | filter-bar, debounce refresh, deep-links, focusTraceId | inferPromQL, Select 三义 | volume SQL, 日志表, service filter |
| **2** | breakdown-grid, bookmarks, lazy | Related metrics, Configure | Labels/Fields L1, Related logs UI |

---

## 相关文档

- [02-metrics-drilldown-spec.plan.md](../plans/02-metrics-drilldown-spec.plan.md)
- [06-logs-drilldown-spec.plan.md](../plans/06-logs-drilldown-spec.plan.md)
- [context-and-adapters.md](./context-and-adapters.md)
- [confirmed-decisions.md](../summaries/confirmed-decisions.md)
