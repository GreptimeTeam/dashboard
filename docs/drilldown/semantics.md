# Drilldown 语义层

> 语义层回答三件事：**这是哪类表、列角色是什么、跨信号身份在哪里**。
> 它不负责查询语法；Metrics 用 PromQL，Logs/Traces 用 SQL，统一由 Context 驱动。

---

## 一句话

| 信号        | 主语义                                             | 兜底 / 手动出口                     |
| ----------- | -------------------------------------------------- | ----------------------------------- |
| **Metrics** | `table_semantics` 的 `metric.*` 声明               | 指标名后缀启发式；用户可 Configure  |
| **Logs**    | `signal_type='log'` + 列角色 / OTel role columns   | 物理列与用户 fieldMap；可手选任意表 |
| **Traces**  | `signal_type='trace'` + `greptime_trace_v1` 列模型 | `trace_id` 列发现 + 用户选表        |

统一优先级：

```text
用户显式选择 / settings
  > table_semantics 声明
  > 实际列形状 + OTLP/Greptime 模型约定
  > Metrics 名字启发式
```

任何一层都不能把不存在的列猜成 SQL。物理列清单是最后的存在性校验。

---

## 公共语义来源

这些来源对三信号共享，代码入口集中在 [`src/observability/semantics/`](../../src/observability/semantics/)：

| 文件         | 职责                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `source.ts`  | 公共 `table_semantics` 目录（SQL、按库缓存、缺失视图记忆）                   |
| `model.ts`   | 纯语义模型：类型、跨信号实体词汇、Metrics/Logs/Traces 约定与打分             |
| `resolve.ts` | 优先级编排：metric meta、entity ref、signal table 发现、`inspectSignalTable` |
| `index.ts`   | 对外 façade                                                                  |

表绑定的 Context 写入不在 semantics 目录内，由 [`signal-binding.ts`](../../src/observability/signal-binding.ts) 独占。

### 1. `information_schema.table_semantics`

```sql
SELECT table_name, signal_type, source, pipeline,
       metadata_quality, semantic_options, entity_declarations
FROM information_schema.table_semantics
WHERE table_schema = <database>;
```

| 字段                  | 语义                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `signal_type`         | 服务端声明的表类别：`metric` / `log` / `trace` / `event` / `unknown`；可为 NULL                |
| `source`              | 写入生态（`opentelemetry` / `prometheus` / …），用于选择身份列约定                             |
| `pipeline`            | 数据模型，最重要的是 `greptime_trace_v1`                                                       |
| `metadata_quality`    | **只描述 `metric.type`**：`declared` / `inferred` / `unknown`，不是整行可信度                  |
| `semantic_options`    | JSON；Metrics 读 `metric.type/unit/temporality/original_name`，Traces 可带 `trace.conventions` |
| `entity_declarations` | 服务端 conventions 推导出的身份列路径；是跨信号 service/container 等身份的第一优先级           |

每个库 dump 一次并派生 `byName` / `bySignal` 索引；视图缺失的库记住缺失，瞬时失败不落缓存。

踩坑：

1. 视图是 catalog 级，必须按 `table_schema` 过滤，否则同名表跨库串数据。
2. `signal_type` 可为 NULL；实体声明可以存在于无 signal 的表上。
3. 被提升为列的键不会重复出现在 `semantic_options`。
4. `metadata_quality` 不影响 unit / temporality / original_name / entity 声明。

### 2. `information_schema.columns` / table-schema store

所有信号共用这一层做**物理存在性与类型校验**：

- 列是否存在：决定语义声明是否可落地、共享 filter 是否适用于当前信号；
- `data_type`：决定 SQL 字面量（数值、boolean）和可分组属性；
- `semantic_type`：补充 TAG / FIELD / TIMESTAMP 角色；
- `tablesHavingColumn('trace_id')`：Traces / Trace→Logs 的候选表预筛。

批量 schema 和 `trace_id` 预筛都有会话缓存。

### 3. 用户显式选择与 settings

用户选择永远是最终出口，但只覆盖对应信号，不反向改写服务端语义：

| 信号       | 显式配置                                             |
| ---------- | ---------------------------------------------------- |
| Metrics    | Configure 中的图表选择；指标目录本身仍来自 Prom API  |
| Logs       | logs table、fieldMap、label include/exclude          |
| Traces     | traces table；无 trace fieldMap 设置（固定模型角色） |
| Trace→Logs | service → logs table 映射与 tombstone                |

### 4. Context 绑定后的派生语义

表绑定后，Explore 把公共语义发布为按信号封装的运行时状态（`ctx.semantics.logs` / `ctx.semantics.traces`）：

| 字段                      | 含义                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `table` / `database`      | 当前绑定表及其所在库（Trace→Logs overlay 时可与用户偏好库不同） |
| `fieldMap`                | 逻辑角色 → 物理列                                               |
| `entityFilterKeys`        | canonical entity（如 `service`）→ 当前表物理 key                |
| `columns` / `columnTypes` | 共享 filter 的适用性和字面量类型                                |
| `revision` / `ready`      | 消费者触发源；`ready` 表示 table + columns 已就绪               |

Metrics **没有**绑定表语义层——目录来自 Prom API，不经过 `inspectSignalTable`。

唯一写入方是 `signal-binding.ts`（`actions.bindTable`）：一次 inspect、原子 `commit`、`revision + 1`，绑定后不调用 `triggerRefresh`。这让一个 `filters[]` 切信号时重新编码，而不是做原始行 JOIN。

---

## 信号独有语义

### Metrics

| 信息                                      | 来源                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| 指标目录                                  | Prom API `__name__/values`（带时间与 match），不扫描语义表         |
| type / unit / temporality / original_name | `semantic_options["metric.*"]`                                     |
| type 可信度                               | `metadata_quality='declared'` 才采信；`mixed/unknown` 显式 unknown |
| classic vs native histogram               | 同库 `${name}_bucket` 伴生表 + `le` 列形状                         |
| 无声明 type / unit                        | 指标名后缀：`_total`、`_bucket`、`_seconds`、`_bytes` 等           |

Metrics 独有原则：语义只决定默认图，用户 Configure 仍可覆盖。`/v1/prometheus/api/v1/metadata` 是另一条服务端入口，当前 dashboard 未用它，因为它丢 `original_name` 并改写 UCUM unit。

### Logs

| 信息                                        | 来源                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 候选表排序                                  | `signal_type='log'` 优先；其余用户表保留为手动出口（不做表名猜测）                                   |
| time / body / severity / service / trace_id | OTel role columns（`timestamp`、`body`、`severity_text`、`service_name`、`trace_id`）+ 用户 fieldMap |
| Label vs Field                              | `semantic_type=TAG`、fieldMap 角色、Loki 默认 OTel resource index-label 列名；其余字符串列是字段     |
| JSON 身份                                   | `resource_attributes.service.name` 这类 chip；只用实际存在的 JSON 容器列                             |

Logs 的“所有表可手选”是有意的逃生门；Trace→Logs 会再用 logs payload + `trace_id` 资格规则收紧。

### Traces

| 信息                 | 来源                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 候选表               | `signal_type='trace'` / `pipeline=greptime_trace_v1` ∪ 实际含 `trace_id` 的表 ∪ `opentelemetry_traces`                   |
| 排序                 | 完整 `greptime_trace_v1` 列模型 > 语义声明 > partial 表名稳定排序                                                        |
| 最低物理资格         | `trace_id`：至少能按 trace id 过滤 / 打开 Gantt                                                                          |
| 完整模型角色         | `trace_id`、`parent_span_id`、`timestamp`、`span_name`、`service_name`；`duration_nano`、`span_id`、status/kind 是加分列 |
| service 身份         | entity declaration > trace 模型 `service_name` > source 约定                                                             |
| 业务筛选 / Breakdown | 实际列发现：intrinsic + `resource_attributes.*` / `span_attributes.*`；ID、payload、时间列不进普通筛选                   |

`trace_id`-only 的自定义表是逃生门，不是完整模型：root spans、RED、Breakdown 依赖的角色缺失时对应功能降级或返回空结果。

### Trace → Logs

适用范围：Traces 首页、Gantt、Span Detail 的 **View logs**。

核心区分：

- **行级查询键**：`trace_id`。目标表确定后，SQL 用它收窄日志。
- **目标表路由键**：service 值 + 当前时间窗。`trace_id` 不可预先枚举，不能作为配置键。

每个 service 解析一个目标 logs 表，路由优先级：

```text
manual mapping
  > learned auto mapping
  > service/time data probe
  > Logs 页当前绑定表（current fallback）
```

路由规则：

- manual 永不被自动覆盖；
- auto 只在探测唯一命中后学习；用户删除过的 service 有 tombstone，不再学习；
- 探测命中多表记为 ambiguous，不猜测，交给 settings；
- 合格候选只有 0/1 张时没有路由价值：不探测、不学习，并清理等价映射，统一回落 Logs 绑定表；
- current 只是可见兜底，打开 Trace→Logs 不改写 Logs 页的持久绑定。

候选资格（探测与 settings picker 共用）：

**必须满足**：

1. 有 `trace_id` 列——没有它无法做行级关联；
2. 有日志证据——`signal_type='log'`，或未声明时存在 `body` / `message` / `msg` / `log` / `content` / `text`；
3. 不是 span 表——声明为非 `log`，或列形状满足完整 trace model，即排除。

**可选条件**：

- service identity 可解析：仅自动探测需要（manual 查询只需 `trace_id`）；
- `timestamp` 存在：探测和查询附加时间窗。

logs 目标表的 service identity 走统一语义链（Traces 侧 service 本身来自 trace 模型 / trace 声明）：

```text
entity_declarations
  > source convention（OTel logs 的 service_name / resource_attributes.service.name）
```

推断是验证式的：候选列必须真实存在；全部不存在则不做自动探测，绝不生成引用不存在列的 SQL。

请求与缓存：

1. `tablesHavingColumn('trace_id')` 预筛候选表；
2. 批量拉取候选 schema，完成资格判断与 identity 解析；
3. 取当前时间窗 service 全集；
4. 未有 manual / auto 答案的 service，用一条 `UNION ALL` 探测所有 pending `(table, service)` 对。

探测 verdict 按 `database + table + time window + service` 缓存；失败会 evict 以便重试；学习到 auto mapping 后，后续解析连探测也不再发起。

消费路径：

| 入口                              | 行为                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Traces 首页 / Gantt / Span drawer | 表加载时预解析 service targets，点击时内存查找                                                 |
| 打开 View logs                    | 目标表不同于当前 Logs 绑定时临时重绑定，关闭后恢复                                             |
| ambiguous service                 | 菜单项进入 Trace→Logs settings，由用户选择                                                     |
| 日志查询                          | 按目标表 `WHERE trace_id = ?` + 时间窗；无 trace 列则返回 `traceAssociationReady:false` 空结果 |

---

## 跨信号语义

Explore 不做原始行 JOIN，而是共享：

1. **时间窗**：`ctx.query.time` / `rangeTime`；
2. **实体身份**：canonical `service` 等实体经 `ctx.semantics.<signal>.entityFilterKeys` 映射到各信号物理列 / JSON chip；
3. **行级 trace 关联**：Logs 与 Traces 都有 `trace_id` 时，`ctx.ui.focusTraceId` / Trace→Logs 用它收窄；
4. **不适用的条件保留但不查询**：切到缺少该列的信号时隐藏，切回再出现。

| 关联             | 键                                                                                      | 粒度          |
| ---------------- | --------------------------------------------------------------------------------------- | ------------- |
| logs ↔ traces    | `trace_id`                                                                              | 行级          |
| metrics ↔ traces | service 身份（metrics 侧优先实际存在的 `service_name`，避免 namespace-qualified `job`） | 服务级 + 时间 |
| metrics ↔ logs   | service 身份（logs 可能是 `resource_attributes.service.name` chip）                     | 服务级 + 时间 |
