# Greptime Drilldown / Explore 功能说明

> 产品代号：Explore（内部） / Drilldown
> 路由：`/dashboard/drilldown`
> 三信号语义（能拿什么 / 从哪拿）：[semantics.md](./semantics.md)

---

## 产品定位与边界

对标 Grafana Metrics / Logs / Traces Drilldown 的 **queryless** 关联观测：用户点选过滤，不写 PromQL / SQL。三信号**单 Context 同屏刷新**，不做三个独立 App 互跳。

| 邻接产品                   | 关系                                                          |
| -------------------------- | ------------------------------------------------------------- |
| logs-query（Logs Explore） | 不同产品，不改造；Drilldown 仅提供「Open in SQL Explore」出口 |
| metrics-query              | PromQL 高级出口                                               |
| traces                     | Trace SQL 高级出口；Gantt 组件可复用                          |
| Perses                     | 解耦；固化看板；Phase 2+ 才做 URL 深链                        |

不做：单独 `/logs-drilldown` 路由；mito 自建表进 Metrics 目录；Loki recording rule 反解（Greptime 无 Loki）。

---

## Correlation Context 与跨信号关联

单一状态源，严格五组（内部 API，无旧字段 alias）：

```text
connection  — signal, per-signal database 偏好
query       — filters[], time / rangeTime, refreshKey
semantics   — logs | traces：table / fieldMap / entity / columns / revision
ui          — metric, tabs, focusTraceId, logsTraceId, logsView…
actions     — setSignal, setFilters, bindTable, openLogsForTrace…
```

分层约束（详见 [semantics.md §4](./semantics.md)）：

1. **binder 是 `semantics.*` 的唯一写入方**（`actions.bindTable`）；绑定后不调用 `triggerRefresh`。
2. **消费者监听 `revision`**（经 `useSignalQuery`），在 `ready` 之前不发查询。
3. **adapters** 只读 ctx，生成 SQL/PromQL；hooks 管「何时查」。

- 跨信号关联三层：
  - **L1 时间**：`query` 是唯一时间源；
  - **L2 filters**：同一组 chips 经各信号 `fieldMap` / 物理列映射为 Prom `match[]` 与 SQL WHERE **并行生效**；目标信号缺少该列时隐藏但不删除，切回再用；
  - **L3 trace_id**：Logs / Traces 共享 `ui.focusTraceId`；**Metrics→Trace 经 Logs**（MVP 无 exemplar）。
- Trace→Logs 临时换表走 overlay 快照，**不改写** `connection.logsDatabase` 持久化偏好。
- 不做原始行 JOIN；URL ↔ Context 双向同步（query key 与 localStorage schema 不变）。

---

## Metrics 关键逻辑

- **目录**：Prom `GET /label/__name__/values`（带 time + match），只收 Prom / OTLP metric；ENGINE=mito 自建表不进目录。
- **inferPromQL**：`table_semantics` 声明（`metadata_quality='declared'` 才采信）→ 指标名后缀启发；delta 不加 `rate`；UCUM 单位优先。详见 [semantics.md](./semantics.md)。
- **histogram 才有** heatmap ↔ percentiles（P99/90/50）主图切换；classic histogram 靠 `${name}_bucket` 伴生表 + `le` 列形状。
- **Select 三义**：选 metric / 选 label / Add to filters。
- **Breakdown**：label 卡 → value 卡；label 仅 1 个 value 时无 Select、无 Add to filter（与 Grafana 对齐）。
- **Related metrics**：全量列表 + Levenshtein 排序（Phase 2）。
- **Related logs**：需 `filters.length > 0` + logsTable + fieldMap；**不看 metric 名**。
- **Group by labels 侧栏不做**（Greptime Prom API 阻塞，见下节）。

---

## Greptime Prom API 约束（注意事项）

| 约束                                                     | 结果                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `GET /labels?match[]={__name__=~".+"}` 报 400            | filters 无 `__name__` 时不传 `match[]`                    |
| `GET /label/{k}/values` 必须 `match[]` 且需含 `__name__` | 顶栏 Metrics value 手输；Breakdown 在 metric 上下文内取值 |
| 无法一次请求拿到 catalog 级 label values                 | Group by labels 不进 UI                                   |
| 无 Loki recording rule                                   | Related logs 不看 metric 名                               |

Filter 录入关键规则：

- 顶栏 Grafana 式 combobox：pill + 分阶段 suggest（label → operator → value）。
- suggest **按当前信号分流**：Metrics → Prom `/labels`；Logs / Traces → SQL 列，映射列 value 可 `SELECT DISTINCT`。
- **同 key 多值合并为 OR**（Prom `=~` / SQL `IN`）；**异 key 之间 AND**。
- `__name__` chip 只缩窄指标目录，不进 PromQL matcher。
- 编辑已有 filter：label 只读，operator / value 可改。

---

## Logs 关键逻辑

- **表发现**：URL / settings → `signal_type='log'` → 列启发式；**不读** logs-query 的 localStorage；所有用户表保留为手动逃生门（不做表名猜测）。
- **fieldMap**：time / body / severity / traceId / service + `primaryGroupBy`，settings 可覆盖。
- **两个主视图**：
  - **列表** = 按 label value 分组的日志列表（Labels breakdown 为主路径）；
  - **详细** = 总 volume 主图 + 单张日志表（全部匹配行）。
- 总 volume 主图**仅详细视图**有；列表视图只有面板内 per-value mini chart。
- 首页 volume / service 卡：SQL `date_bin` + `GROUP BY primaryGroupBy`（对标 Loki index / volume）。
- **Select 与 Include 分离**：列表 Include 只更新 chips（同 key OR）；Select（或 overview 内 Show logs）才写 filter 进详细视图。
- 行内 `trace_id` → `focusTraceId`（L3）。
- Breakdown 图：Count = 各 value 条数时序；Avg = 数值列均值。
- 不做：Loki / LogQL、patterns API、recording rule 反查。

---

## Traces 关键逻辑（MVP）

- 单页 `?signal=traces`，无独立详情路由；Gantt 为全宽 drawer（`focusTraceId` 驱动，关闭后保留 chips）。
- 首页：table 选择 + Trace ID 快搜 → **RED 等宽三联**（Rate / Errors / Duration）→ tabs：Breakdown | Traces。
- `selectedRedMetric` 是调查焦点开关：驱动 Breakdown 聚合与 Traces 列表排序（errors 只看 errored root spans；duration 按 `duration_nano` 倒序）；三联图选中态只换边框 / 背景，**不放大不重排**。数据一律 SQL `date_bin`，duration 主图为 heatmap。
- filters key 池 = 业务字段（intrinsic + 扁平属性列 + `duration_nano`）；`trace_id` / `span_id` / 时间列 / payload 不进筛选（Trace ID 有独立入口）。算子按列类型：数值字面量不加引号；boolean 渲染 `TRUE` / `FALSE`（Greptime 对 boolean 用字符串会 planning 报错）。
- 表发现：语义声明 ∪ 实际含 `trace_id` 的表 ∪ `opentelemetry_traces`；完整 `greptime_trace_v1` 列模型优先；`trace_id`-only 自定义表是逃生门，缺模型角色时 RED / Breakdown 降级或返回空。
- Breakdown（Phase B）：Group-by 分 **All / Resource / Span** 三档，聚合绑定当前 redMetric。

---

## Trace→Logs

Traces 侧「View logs」的完整关联契约（路由优先级、候选资格、缓存）见 [semantics.md](./semantics.md) 的 Trace→Logs 章节。核心：**行级查询键是 `trace_id`；目标表路由键是 service 值 + 当前时间窗**。

---

## 待定项

- Explore 首屏布局（三联同屏 vs Logs 分层首页 vs 混合）
- Prom API capability 探测脚本入库
- Traces Breakdown 卡网格（Phase B）
- Feishu 内部需求文档

---

## 参考

- [Grafana Metrics Drilldown](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/metrics/)
- [Grafana Logs Drilldown](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/logs/)
- [Grafana Traces Drilldown](https://grafana.com/docs/grafana/latest/visualizations/simplified-exploration/traces/)
- [GreptimeDB Semantic Layer](https://docs.greptime.com/user-guide/concepts/semantic-layer/)
