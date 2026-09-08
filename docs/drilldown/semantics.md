# Drilldown 语义信息

> Greptime 无 Prometheus `/metadata`；语义主入口是 [`information_schema.table_semantics`](https://docs.greptime.cn/nightly/user-guide/semantic-layer/table-semantics/)。  
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
- `metadata_quality`：Metrics 仅 **`declared`** 采信 type/unit/temporality/original_name；`inferred` 不用来决定 `rate`
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

**注意**：存量 Prom RW 表常无语义行；histogram 常拆 `_bucket`/`_sum`/`_count`，仅 `_bucket` 的 type=histogram 走 heatmap。

**已用 / 未用**：type·unit·temporality·original_name ✅；`source` UI、按 original_name 搜索、quality 提示、`entity_declarations` ⬜。

---

## Logs — 能拿什么 / 从哪拿

| 信息 | 来源 |
|------|------|
| 哪张是 log 表 | ① `table_semantics`（`signal_type='log'`）② 表名启发式（`log` / `otel_logs`…）③ **用户选表 / settings** |
| 列角色 TAG / FIELD / TIMESTAMP | `information_schema.columns`（或 DESC）的 **`semantic_type`** |
| service / body / trace_id 等映射 | ① **OTel 常见列名**（`service_name`、`body`/`severity_text`、`trace_id`…）② Context **fieldMap**（settings 可覆盖） |
| source / pipeline | `table_semantics`（可选加强） |

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
