# Drilldown 语义信息

> Greptime **有** Prometheus `/v1/prometheus/api/v1/metadata`（route `src/servers/src/http.rs:1351`、handler `http/prometheus.rs:279`），并且它本身就读语义层（`prometheus_metadata_from_table`，`prometheus.rs:2179`）。语义主入口仍取 [`information_schema.table_semantics`](https://docs.greptime.cn/nightly/user-guide/semantic-layer/table-semantics/)，理由改成"覆盖更全"（log/trace、`original_name`、signal/source/pipeline、不受逻辑表限制），不是"没有 `/metadata`"。  
> **注意**：type/unit/temporality → 是否加 `rate()` 这条策略，服务端 metadata 与 dashboard `shouldApplyRate` 各有一份实现，已知差异见下。  
> **原则**：语义目录优先 → 各信号约定 / 名字启发 → 用户设置兜底。

---

## 一句话

| 信号 | 第一优先 | 兜底 |
|------|----------|------|
| **Metrics** | `table_semantics`（declared 的 type/unit/temporality…） | **指标名**启发式 |
| **Logs** | `table_semantics`（哪张 log 表）+ 列 `semantic_type` | **OTel 列名**；再不行 **选表 / fieldMap / settings** |
| **Traces** | `table_semantics`（常带 `pipeline=greptime_trace_v1`） | **标准 trace 列模型**；也可 settings |

---

## 公共目录

```sql
SELECT table_name, signal_type, source, source_version, pipeline,
       metadata_quality, semantic_options, entity_declarations
FROM information_schema.table_semantics;
```

- `semantic_options`：JSON（已去 `greptime.semantic.` 前缀）
- `metadata_quality`：**只描述 `metric.type`**（协议声明 → `declared`，名字后缀猜 → `inferred`，冲突 collapse → `unknown`）。Metrics 仅 `declared` 采信 type；unit / temporality / original_name 没有"猜"的写入路径，存在即可用（`inferred` 也照用）
- `entity_declarations`：实体关联（跨信号）— **产品尚未读**

代码：[`table-semantics.ts`](../../src/observability/table-semantics.ts)、[`resolve-metric-meta.ts`](../../src/observability/resolve-metric-meta.ts)（Metrics）、[`logs/resolve-table.ts`](../../src/observability/logs/resolve-table.ts)（Logs 选表）。

---

## Metrics — 能拿什么 / 从哪拿

| 信息 | 来源 |
|------|------|
| 是 metric、接入来源 | `table_semantics`：`signal_type`、`source` |
| 可信度 | `metadata_quality` |
| 类型 counter / gauge / histogram / … | `semantic_options["metric.type"]`（declared） |
| 单位 UCUM（`s`、`By`、`{request}`…） | `semantic_options["metric.unit"]` → 轴/tooltip；rate 时传播（如 `By`→`Bps`） |
| cumulative / delta | `semantic_options["metric.temporality"]`；`delta` 不加 `rate()` |
| OTel 原名 | `semantic_options["metric.original_name"]`（抽屉副标题） |
| 无语义时的类型 | **名字**：`_total`/`_count`→counter；`_bucket`/`*_seconds`→histogram；否则当 gauge |
| 无语义时的单位 | **名字后缀**：`_bytes`、`_seconds`… |
| 指标列表 | Prom `__name__/values`（**不是**扫语义目录） |

**默认画法（declared type 或名启发）**：counter→`sum(rate)` 折线；gauge/updown→`avg` 折线；histogram→`sum(rate(..._bucket)) by (le)` heatmap（可切 percentiles）。用户仍可 Configure。

**注意**：存量 Prom RW 表常**只有** signal/source/quality（本实例 480 条 `inferred`、`semantic_options` 为 NULL），type/unit 靠名字启发式；histogram 常拆 `_bucket`/`_sum`/`_count`，仅 `_bucket` 的 type=histogram 走 heatmap。native（OTLP exponential）与 gauge histogram 没有 `_bucket`/`le` 矩阵，走"暂不支持"占位且**不发查询**。

**已用 / 未用**：type·unit·temporality·original_name ✅；`source` UI、按 original_name 搜索、quality 提示、`entity_declarations` ⬜。

### Prometheus `/metadata`（另一条入口，dashboard 目前未用）

`GET /v1/prometheus/api/v1/metadata`，按 `current_schema` 取表并走 `check_query_permission`。它已经实现了 dashboard 在本地重算的那套判定：

- `updown_counter → gauge`、`gauge_histogram → gaugehistogram`、`mixed → unknown`
- counter/histogram 且 `temporality=delta|mixed` → `unknown`（**与 dashboard 的差异点**：`shouldApplyRate` 只特判 `delta`，`mixed` 仍会加 `rate()`）
- 无 type 但有 native histogram 列 → `histogram`；UCUM → OpenMetrics unit

**覆盖范围**：要求 `LOGICAL_TABLE_METADATA_KEY`，即 metric-engine 逻辑表。本实例 `public` 有 1226 张 `engine=metric`、64 张 `mito`，OTLP demo 指标（如 `gen_ai_*`）也落在 metric engine 里，所以实测**能**查到它们；纯 mito 表不在其中。

**局限**：不返回 `original_name`；unit 被转回 OpenMetrics 词并丢掉 annotation——实测 `gen_ai_client_token_usage_count` 返回 `unit: ""`（`{token}` 丢失），`gen_ai_client_operation_duration_seconds_bucket` 返回 `unit: "seconds"`（UCUM `s` 被改写）。

---

## Logs — 能拿什么 / 从哪拿

| 信息 | 来源 |
|------|------|
| 哪张是 log 表 | ① `table_semantics`（`signal_type='log'`）② 表名启发式（`log` / `otel_logs`…）③ **用户选表 / settings** |
| 列角色 TAG / FIELD / TIMESTAMP | `information_schema.columns`（或 DESC）的 **`semantic_type`** |
| service / body / trace_id 等映射 | ① **OTel 常见列名**（`service_name`、`body`/`severity_text`、`trace_id`…）② Context **fieldMap**（settings 可覆盖） |
| source / pipeline | `table_semantics`（可选加强） |
| **筛选 vs Add label** | 不让用户区分 Label 和 Field。两边都是 SQL `WHERE`。Add label 只认判定集合：`semantic_type=TAG`、`fieldMap.severity` / `service` / `primaryGroupBy`、`labelInclude`、以及 Loki 默认的 OTEL resource index-label 列名（点换成下划线，例如 `service_name`、`k8s_pod_name`）。`labelExclude` 优先。其余字符串列（如 `err`）不是 label。筛选键 = 这些 label（不含 severity）+ 非 label 字符串列。非 label 字符串列的 `=~` 是包含匹配，不做 DISTINCT。Level 仍是 `fieldMap.severity`，单独 select，不进顶栏筛选键。实现：[`logs/field-map.ts`](../../src/observability/logs/field-map.ts) |

Related logs（从 Metrics）：不看 metric 名；要 `filters` + `logsTable` + fieldMap → SQL。

---

## Traces — 能拿什么 / 从哪拿

| 信息 | 来源 |
|------|------|
| 哪张是 trace 表 | ① `table_semantics`（`signal_type='trace'`）② 列发现（存在 `trace_id` + `parent_span_id`）③ **用户 / settings** |
| 布局约定 | `pipeline`（如 `greptime_trace_v1`）、`semantic_options["trace.conventions"]` |
| Span 结构 | **标准语义模型列**：`trace_id`、`span_id`、`parent_span_id`、`timestamp`、`duration_nano`、`service_name`、`span_name`… |
| 列角色 | 同 Logs：`semantic_type` |
| 与 Logs 关联 | 共有 **`trace_id`**（+ filters / fieldMap） |

---

## 跨信号（未做完）

携带 **实体身份 + 作用域 + 时间**，各信号独立查，不做原始行 JOIN。  
实体键可来自 `entity_declarations` / semantic graph，或今日的 filters（如 `service_name`）+ `trace_id`。

---

## 实现落点（代码）

| 信号 | 主要路径 |
|------|----------|
| Metrics | `resolve-metric-meta.ts`、`infer-promql.ts`、`metric-units.ts`、主图 / sparkline / Breakdown hooks |
| Logs | `logs/resolve-table.ts`、`buildDefaultLogsFieldMap`、drilldown Related logs |
| Traces | 现有 traces 页按标准列；Drilldown Traces 首页仍 ⬜ |
