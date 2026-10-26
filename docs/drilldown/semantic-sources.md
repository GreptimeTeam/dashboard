# 三信号语义来源参考

> 对照 [semantics.md](./semantics.md)（Explore 如何消费语义）与 GreptimeDB Nightly
> [Semantic Layer](https://docs.greptime.com/nightly/user-guide/semantic-layer/overview/)。
> 本文只列：**语义从哪来、能否用 SQL/API 确认、各信号分别依赖什么**。

统一优先级（与 semantics.md 一致）：

```text
用户显式选择 / settings
  > information_schema.table_semantics
  > 实际列形状 + OTLP/Greptime 约定
  > Metrics 名字启发式
```

任何一层都不能把不存在的列猜成 SQL。

---

## 可查语义来源总表

| 代号 | 来源 | 查法 | 用途 |
| ---- | ---- | ---- | ---- |
| **A** | `information_schema.table_semantics` | SQL | 表级 signal / source / pipeline / metric.\* / entity_declarations |
| **B** | `information_schema.columns`（含 `semantic_type`） | SQL / `DESCRIBE` | 物理列存在性、TAG/FIELD/TIMESTAMP、扁平 attr |
| **C** | `greptime_private.semantic_entities` | SQL（**必须**带 `observed_at` 下界） | 实体节点（service / host / k8s…） |
| **D** | `greptime_private.semantic_relationships` | 同上 | 实体边（`calls` / `runs_on` / `part_of`…）+ calls 的 RED |
| **E** | Prometheus HTTP API | `/v1/prometheus/api/v1/label/__name__/values` 等 | **仅 Metrics 目录**；Explore 不扫 A 建目录 |
| **F** | Dashboard settings / Context fieldMap | 本地配置 | 用户绑表、Configure、label include/exclude |

探测示例：

```sql
-- A
SELECT table_schema, table_name, signal_type, source, pipeline,
       metadata_quality, semantic_options, entity_declarations
FROM information_schema.table_semantics
WHERE table_schema = 'public'
ORDER BY signal_type, table_name;

-- C / D（须下界）
SELECT entity_type, COUNT(DISTINCT entity_id) AS n
FROM greptime_private.semantic_entities
WHERE observed_at >= now() - INTERVAL '1' HOUR
GROUP BY entity_type;

SELECT rel_type, provenance, COUNT(*) AS rows_n
FROM greptime_private.semantic_relationships
WHERE observed_at >= now() - INTERVAL '1' HOUR
GROUP BY rel_type, provenance;
```

---

## Metrics

Explore 回答：选哪条指标、默认图、label filter、单位。  
**不**把「当前 metrics 表」绑进 `ctx.semantics.metrics`（目录来自 Prom API）。

| 语义项 | 来源 | 说明 |
| ------ | ---- | ---- |
| 指标目录 | **E** | 带 time + match；不扫描语义表 |
| signal / source | **A** | `signal_type='metric'`；`source` = `opentelemetry` / `prometheus` / `custom` / … |
| type / unit / temporality / original_name | **A** `semantic_options["metric.*"]` | OTLP 写入时常为完整 options |
| type 是否可信 | **A** `metadata_quality` | 仅 `declared` 采信 type；`inferred` / `unknown` / `mixed` 不盲信 |
| classic vs native histogram | **B** | 同库 `${name}_bucket` + `le` 列形状 |
| 系列标签 / service 身份 | **B** TAG 列 | 常见 `service_name` / `job` / `instance` / `service_namespace` |
| 无声明兜底 | Dashboard 名启发式 | `_total`、`_bucket`、`_seconds`、`_bytes` 等 |
| 用户覆盖 | **F** Configure | 可改默认图；不反向改写服务端语义 |
| 进 semantic graph（C/D） | 通常否 | 例外：`target_info`、白名单 kube-state-metrics、可选 `greptime_otel_resource_info`（见 DB 文档）；**不产生**自动 `calls` |

---

## Logs

Explore 回答：哪张日志表、列角色、label vs field、与 Trace 行级关联。

| 语义项 | 来源 | 说明 |
| ------ | ---- | ---- |
| 候选表 | **A** `signal_type='log'` 优先 | 其余用户表可手选（逃生门）；不做表名猜测 |
| signal / source | **A** | 常见 `log` + `opentelemetry`；pipeline / options 常空 |
| 列角色（time / body / severity / service / trace_id） | **B** + OTel 约定 + **F** fieldMap | 约定列：`timestamp`、`body`、`severity_text`、`service_name`、`trace_id`；缺列时可用 JSON chip |
| service 身份 | **A** entity_declarations（若有）> **B** 列 / `resource_attributes.service.name` chip | 许多 OTLP logs 表无顶层 `service_name`，身份在 JSON 容器内 |
| Label vs Field | **B** `semantic_type=TAG` + fieldMap + Loki 默认 index-label 约定 | 其余字符串列当字段 |
| 进 semantic graph（C/D） | 默认否 | 仅当表上声明了 `greptime.semantic.entity.*`（或 conventions 产出 entity） |
| Trace→Logs | **B** 必须有 `trace_id`；自动探测还须 **A** `signal_type='log'` | 详见 [semantics.md § Trace → Logs](./semantics.md) |

---

## Traces

Explore 回答：哪张 span 表、是否完整 `greptime_trace_v1`、RED / Breakdown / Gantt、service 实体、下钻 Logs。

| 语义项 | 来源 | 说明 |
| ------ | ---- | ---- |
| 候选表 | **A** `signal_type='trace'` / `pipeline=greptime_trace_v1` ∪ **B** 含 `trace_id` | 无硬编码默认表名 |
| pipeline / conventions | **A** | 例：`pipeline=greptime_trace_v1`；`semantic_options["trace.conventions"]` |
| 完整模型角色 | **B** | 必备：`trace_id`、`parent_span_id`、`timestamp`、`span_name`、`service_name`；加分：`duration_nano`、`span_id`、status/kind |
| service 等实体声明 | **A** `entity_declarations` | 约定常含 `service`、`service.instance`、`container` / k8s.\*（视列是否存在） |
| Breakdown / filter attrs | **B** | 扁平 `resource_attributes.*` / `span_attributes.*`；ID、payload、时间列不进普通筛选 |
| 进 semantic graph（C/D） | **主路径（零配置）** | 节点：service 等；边：`calls`（带 RED）+ 同行双身份的 `runs_on` / `part_of` 等 |
| 辅助目录表 | 约定 `{trace}_services` / `{trace}_operations` | 服务端自动维护；Explore 亦可 DISTINCT / 读图 API |

`calls` 由服务端在查 **D** 时从 span 配对推导（对齐 Tempo / OTel servicegraph），Dashboard **不应**再自写 CLIENT→SERVER self-join。推断节点（virtual node）peer 属性优先级见 [Semantic graph](https://docs.greptime.com/nightly/user-guide/semantic-layer/semantic-graph/)。

---

## 三信号对照

| | Metrics | Logs | Traces |
| - | ------- | ---- | ------ |
| DB 声明主入口 | A `metric.*` | A `signal_type=log` | A + `greptime_trace_v1` |
| 物理列 | B TAG/FIELD | B + 常有 JSON 容器 | B 扁平 OTel 列 |
| 目录 / 选表 | **E** Prom API | 表列表（A 优先） | 表列表（A ∪ `trace_id`） |
| Explore Context 绑表 | 否 | 是 | 是 |
| 典型 entity 声明 | 普通指标无；descriptor 例外 | 常无 | **有**（service 等） |
| 图 C/D 贡献 | 通常无 / 仅 descriptor | 通常无 | **主贡献**（含 `calls` RED） |

跨信号关联仍按 [semantics.md § 跨信号语义](./semantics.md)：共享时间窗与实体身份映射，**不做**原始行 JOIN；logs↔traces 另用 `trace_id` 行级关联。

---

## 与 Service Map / 实体关系图

| 产品切片 | 读什么 | 主信号 |
| -------- | ------ | ------ |
| Service Map | C 中 `entity_type='service'` + D 中 `rel_type='calls'` | Traces |
| 实体关系图 | C 全类型 + D 多 `rel_type` | Traces 为主；Metrics descriptor / 手宣可补 |

图 API 与查询模式见官方 [Semantic graph](https://docs.greptime.com/nightly/user-guide/semantic-layer/semantic-graph/)。

---

## 实查快照（可复现，非契约）

以下为某次本地实例（GreptimeDB `1.3.0-alpha.1`，库 `public`）的观测，用于对照排查；**数值会变，来源代号 A–F 才是稳定契约**。

`table_semantics` 分布示例：

| signal_type | source | pipeline / quality | n（约） |
| ----------- | ------ | ------------------ | ------- |
| metric | prometheus | inferred | 483 |
| metric | opentelemetry | declared | 326 |
| metric | custom | declared | 6 |
| log | opentelemetry | （空 options） | 2 |
| trace | opentelemetry | `greptime_trace_v1` | 1 |

- Logs 例：`opentelemetry_logs` 无顶层 `service_name`，`resource_attributes` JSON 含 `service.name` / `service.namespace`；**无** `entity_declarations` → 未进 C。
- Traces 例：`opentelemetry_traces` 有 `entity_declarations`（service / service.instance / container）；近窗 C 见 service 节点，D 见 `calls`（含 `confidence=0.5` 推断/virtual 节点）及 `part_of` / `runs_on`。
- Metrics 例：OTLP 表带完整 `metric.*`；Prom remote write 多为 `inferred` 且 options 空；普通指标未出现在实体的 `source_tables` 中。
