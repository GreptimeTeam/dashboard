# Service Map — AI 提示用 Brief

> 将下文整段（或从「角色」起）粘贴给 AI，用于产出**产品计划**与**代码规划**。  
> 事实来源：GreptimeDB Nightly Semantic Layer + Dashboard Explore 文档。  
> 详细语义来源表：[semantic-sources.md](./semantic-sources.md)。

---

## 角色与任务

你是 Greptime Dashboard（Vue 3 + TypeScript）的产品/工程规划助手。请基于下列**已确认约束**分别输出：

1. **产品计划**：目标用户、问题、范围（P0/P1/P2）、用户流程、验收标准、不做清单、风险。  
2. **代码规划**：模块边界、关键文件落点、数据流、SQL/API 契约、与现有 Explore Context 的集成、测试与性能护栏、里程碑。

不要重新发明拓扑推导；不要提议 Dashboard 内 span self-join。不要扩展到 Datadog Catalog / Monitor / USM / RUM。

---

## 产品一句话

在 Greptime Dashboard 增加 **Service Map**：在选定时间窗内展示 **服务调用拓扑 + RED 健康度**，并下钻到现有 **Explore（Traces / Logs）**。对标 Datadog Service Map 的核心价值，数据走 GreptimeDB **Semantic Graph**，而非自建边计算。

完整「实体关系图」（多实体类型 + 部署边）是 **P1**，不阻塞 Service Map MVP。

---

## 关键术语

| 术语 | 含义 |
|------|------|
| Service Map | 节点≈service，边=`calls`，带 RED；可含虚拟/DB 节点 |
| 实体关系图 | 多 `entity_type` + 多 `rel_type`（calls / runs_on / part_of / …） |
| Explore | 现有 Metrics/Logs/Traces Drilldown，路由 `/dashboard/explore`（drilldown） |
| Semantic Graph | `greptime_private.semantic_entities`（C）+ `semantic_relationships`（D） |

---

## 语义约束（必须遵守）

### 图数据只读 C / D

- **C** `greptime_private.semantic_entities`：节点。身份 = `(entity_type, entity_id)`。Service Map 主用 `entity_type = 'service'`。含 `scope`、`descriptive`、`source_tables`（下钻用）。查询结果按观测行展开，**必须 DISTINCT**。  
- **D** `greptime_private.semantic_relationships`：边。Service Map 主用 `rel_type = 'calls'`。方向 src→dst。字段含 `provenance`、`confidence`、`request_count`、`error_count`、`unmatched_count`、`duration_sum|count|max`、`attributes`（如 `connection_type`）。  
- 查询 **必须**带 `observed_at` 下界（`>=` / `BETWEEN` / `now() - INTERVAL`）；禁止对 `observed_at` 用 OR/IN。默认无下界时 DB 只扫约 1 小时。  
- 实体连接必须用 `(entity_type, entity_id)` **双列**，禁止只 join id。  
- C/D 在查询时按声明推导（手宣边除外）；宽窗昂贵 → MVP 短窗 + 节点/边上限。

### `calls` 边语义（服务端已实现）

- 来自 **OTLP traces** 零配置：CLIENT↔SERVER（及 messaging）配对，对齐 Tempo / OTel servicegraph。  
- `confidence = 1.0`：配对成功；`0.5`：无 server、用 peer/db/server.address 命名的**虚拟节点**。  
- Metrics / Logs **默认不贡献** `calls`。Logs 通常无 entity 声明则不进图。  
- RED 反映**已存储** span 对；采样会低估流量、可能偏斜错误率。

### 与 Explore 语义来源关系（A–F）

- **A** `information_schema.table_semantics`、**B** columns：表/列是什么（Explore 绑表、PromQL/SQL）。  
- **C/D**：实体怎么连（Service Map）。  
- **E** Prom API：仅 Metrics 目录。  
- **F** 用户 settings / fieldMap。  
- Dashboard **禁止**用 A/B 自己算拓扑；下钻用 C.`source_tables` + Explore 共享时间窗与 `service` filter，**不做**三信号行 JOIN。

### Service Map vs 实体关系图

- Service Map = `service` 节点 + `calls` 边（+ 虚拟节点）。  
- 实体关系图另含 `runs_on` / `part_of` / `contains` / 手宣 `depends_on`/`owns` 等 → P1。

---

## 需求分层

### P0 — Service Map MVP

- 入口：Explore 旁或 Traces 内 Tab / 独立路由（规划时选定一种，与现有 navbar/IA 一致）。  
- 数据：查 C（service）+ D（calls，按窗聚合 RED）。  
- UI：力导向或分层图；边粗细/颜色反映流量与错误；虚拟/DB 节点可区分样式。  
- 时间窗：与 Explore Context `query.time` 对齐。  
- 交互：点击 service → 写入 service 实体 filter 并打开/切换 Traces Explore；可选侧栏展示边 RED。  
- 护栏：默认 15m–1h；节点/边数量上限；超时与空态（无 traces / 无 calls）。  
- 空依赖：无 OTLP traces 或图为空时的说明文案。

### P1

- 单服务上下游聚焦（filter src/dst）。  
- scope / env 过滤（仅当实体有 scope 或相关列）。  
- 可选「实体关系」图层：叠加 `runs_on` / `part_of` / `contains`。

### P2

- 手宣边 `depends_on` / `owns`。  
- operation 级依赖。  
- service id 对齐说明/工具（trace 与 metrics `job` 命名可能不一致）。  
- 大规模：依赖 DB/Collector 预聚合，非 Dashboard 扫全量 span。

### 明确不做

Datadog Service Catalog 所有权、Monitor/Incident 着色、USM/eBPF、RUM 节点、Load Amplification Navigator、30 天边记忆、Dashboard 内 span CLIENT→SERVER self-join。

---

## 核心 SQL 契约（规划实现时使用）

```sql
-- 节点（去重）
SELECT DISTINCT entity_type, entity_id, scope, source_tables
FROM greptime_private.semantic_entities
WHERE entity_type = 'service'
  AND observed_at >= ? AND observed_at < ?;

-- 边 + RED（按端点聚合）
SELECT src_type, src_id, dst_type, dst_id, provenance, confidence, attributes,
       sum(request_count) AS requests,
       sum(error_count) AS errors,
       sum(unmatched_count) AS unmatched,
       sum(duration_sum) AS duration_sum,
       sum(duration_count) AS duration_count,
       max(duration_max) AS duration_max
FROM greptime_private.semantic_relationships
WHERE rel_type = 'calls'
  AND observed_at >= ? AND observed_at < ?
GROUP BY src_type, src_id, dst_type, dst_id, provenance, confidence, attributes;
```

平均延迟：`duration_sum / nullif(duration_count, 0)`；错误率：`errors / nullif(requests, 0)`。

---

## 代码库锚点（实现须对齐）

| 区域 | 路径 / 说明 |
|------|-------------|
| Explore 语义文档 | `docs/drilldown/semantics.md`、`docs/drilldown/semantic-sources.md` |
| Explore 壳 | `src/views/dashboard/drilldown/` |
| 语义解析 | `src/observability/semantics/`（A/B；图查询为新 adapter，勿塞进错误层） |
| Traces RED / 适配 | `src/observability/traces/`、`src/observability/adapters/traces.ts` |
| Context / 绑表 | `src/observability/signal-binding.ts`、drilldown Context（filters、time、service 实体） |
| 路由 | `src/router/routes/modules/dashboard.ts` |
| i18n | `src/locale/**/drilldown.ts` 等 |

建议新代码（名称可调整，职责固定）：

- `src/observability/traces/service-map-queries.ts`（或 `semantic-graph/`）：C/D SQL builder。  
- `src/observability/adapters/service-map.ts`：执行与结果规范化。  
- `src/views/dashboard/drilldown/service-map/`（或同级路由视图）：图 UI。  
- 单测：SQL 契约、时间窗下界、聚合与空结果。

技术栈惯例：Vue 3 SFC、现有图表/布局模式、改完跑 ESLint（`npx eslint --fix`）。

---

## 你应输出的文档结构

### A. 产品计划

1. 问题与成功标准  
2. Persona / 场景（例：排障时看谁依赖谁、哪个下游错误率高）  
3. P0 用户流程（进入 → 选时间 → 看图 → 点服务 → Traces）  
4. 信息架构（入口放哪、与 Explore 关系）  
5. P0/P1/P2 范围表 + 不做清单  
6. 风险（采样 RED、宽窗性能、service id 不一致、experimental API）  
7. 验收 checklist  

### B. 代码规划

1. 架构图（UI → adapter → C/D SQL → Context 下钻）  
2. 文件级改动清单（新增 / 修改）  
3. 类型与 API 契约（Node、Edge、RED）  
4. 状态：是否复用 Explore Context 或独立 store  
5. 性能与错误处理  
6. 测试计划  
7. 里程碑（MVP → P1）与依赖（Nightly Semantic Graph 可用）

---

## 一句话约束（写在计划开头）

> Service Map MVP = 查询 `semantic_entities` + `semantic_relationships`（calls）渲染拓扑与 RED，并下钻 Explore；禁止 Dashboard 内自建 span 拓扑；实体关系图与 Datadog 周边产品能力不进 P0。
