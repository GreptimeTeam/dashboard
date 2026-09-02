# Greptime Drilldown / Explore 规划文档

本目录保存 **已对齐、可指导开发** 的 Drilldown 规划，按类别归档。完整 plan 副本在 [`plans/`](./plans/)；快速阅读摘要在 [`summaries/`](./summaries/)。

> **产品代号**：Explore（内部） / Drilldown  
> **目标路由**：`/dashboard/explore`  
> **最后整理**：2026-08-31

---

## 阅读顺序（开干前）

| 顺序 | 文档 | 用途 |
|------|------|------|
| 1 | [summaries/confirmed-decisions.md](./summaries/confirmed-decisions.md) | **已确认**产品边界、技术方向、不做项 |
| 2 | [plans/01-product-explore-master.plan.md](./plans/01-product-explore-master.plan.md) | 产品 Master：Context、语义层、三信号、Phase |
| 3 | [plans/02-metrics-drilldown-spec.plan.md](./plans/02-metrics-drilldown-spec.plan.md) | Metrics 功能清单 + Greptime 取数 + UI 规则 |
| 4 | [plans/06-logs-drilldown-spec.plan.md](./plans/06-logs-drilldown-spec.plan.md) | Logs 功能清单 + SQL 取数 + fieldMap |
| 4b | [architecture/metrics-vs-logs-drilldown-rules.md](./architecture/metrics-vs-logs-drilldown-rules.md) | **M/L 规则对照与公共模块（实现前必读）** |
| 5 | [summaries/phase0-checklist.md](./summaries/phase0-checklist.md) | Phase 0 可执行 checklist |
| 6 | [plans/03-grafana-drilldown-research.plan.md](./plans/03-grafana-drilldown-research.plan.md) | Grafana 加载与关联调研（参考） |
| 7 | [plans/04-perses-vs-drilldown.plan.md](./plans/04-perses-vs-drilldown.plan.md) | Perses 集成边界（决策） |

---

## 文档分类

### A. 产品 Master（Active — 开发主入口）

| 文件 | 说明 | 状态 |
|------|------|------|
| [plans/01-product-explore-master.plan.md](./plans/01-product-explore-master.plan.md) | Explore 总规划：边界、Context、M/L/T 行为、Phase 0–2 | **Active** |
| [summaries/confirmed-decisions.md](./summaries/confirmed-decisions.md) | 已从 Master 提炼的**冻结决策** | **Active** |
| [summaries/phase0-checklist.md](./summaries/phase0-checklist.md) | Phase 0 模块与验收 | **Active** |

### B. Metrics Drilldown（Active — 规格最全）

| 文件 | 说明 | 状态 |
|------|------|------|
| [plans/02-metrics-drilldown-spec.plan.md](./plans/02-metrics-drilldown-spec.plan.md) | 功能 A–F、inferPromQL、Select/Related/Configure 规则 | **Active** |
| [metrics/README.md](./metrics/README.md) | Metrics 文档索引与 Greptime 模块落点 | **Active** |

### C. Logs Drilldown（Active）

| 文件 | 说明 | 状态 |
|------|------|------|
| [plans/06-logs-drilldown-spec.plan.md](./plans/06-logs-drilldown-spec.plan.md) | 功能 A–G、resolveLogsTable、SQL volume、Labels、跨信号 | **Active** |

### D. Traces Drilldown（Pending — 待独立 spec）

| 信号 | 现状 | 下一步 |
|------|------|--------|
| **Traces** | Master plan §Traces 行为 | 新建 `plans/07-traces-drilldown-spec.plan.md` |

Logs/Traces 的 Grafana 调研摘要见 [plans/03-grafana-drilldown-research.plan.md](./plans/03-grafana-drilldown-research.plan.md)。

### E. 架构与边界决策（Reference + Active）

| 文件 | 说明 | 状态 |
|------|------|------|
| [plans/04-perses-vs-drilldown.plan.md](./plans/04-perses-vs-drilldown.plan.md) | Perses 不做 Drilldown 框架；Phase 2+ 深链 | **决策已确认** |
| [architecture/context-and-adapters.md](./architecture/context-and-adapters.md) | Context + 三 adapter 数据流摘要 | **Active** |
| [architecture/metrics-vs-logs-drilldown-rules.md](./architecture/metrics-vs-logs-drilldown-rules.md) | **M/L 规则对照 + 公共实现模块** | **Active** |
| [plans/03-grafana-drilldown-research.plan.md](./plans/03-grafana-drilldown-research.plan.md) | Grafana 三 App 加载与关联机制 | **Reference** |

### F. UI 布局草案（Reference — 不阻塞 Phase 0）

| 文件 | 说明 | 状态 |
|------|------|------|
| [plans/05-ui-layout-draft.plan.md](./plans/05-ui-layout-draft.plan.md) | 早期三联屏 / 分层首页草案 | **待定**，不阻塞基建 |

---

## Plan 源文件对照（Cursor plans 目录）

仓库内 [`docs/drilldown/plans/`](./plans/) 为以下 Cursor plan 的**快照副本**（开发以仓库 docs 为准同步更新）：

| 仓库副本 | Cursor 源路径 |
|----------|-----------------|
| `01-product-explore-master.plan.md` | `~/.cursor/plans/explore_drilldown_unified_83100fe3.plan.md` |
| `02-metrics-drilldown-spec.plan.md` | `~/.cursor/plans/grafana_metrics_drilldown_beb9ddf1.plan.md` |
| `06-logs-drilldown-spec.plan.md` | 仓库内撰写（无 Cursor 源） |
| `03-grafana-drilldown-research.plan.md` | `~/.cursor/plans/grafana_drilldown_research_95fc5715.plan.md` |
| `04-perses-vs-drilldown.plan.md` | `~/.cursor/plans/perses_vs_drilldown_7cc29c34.plan.md` |
| `05-ui-layout-draft.plan.md` | `~/.cursor/plans/drilldown_ui_planning_733409b9.plan.md` |

---

## 待定项（未冻结，不写入 confirmed-decisions）

- Explore **首屏布局**（三联同屏 vs Logs 分层首页 vs 混合）
- Greptime Prom API **capability 矩阵**（`match[]` / `start`/`end` 是否收窄 `__name__/values`）— 实现前需脚本探测
- **Traces** 独立 spec 文档（结构与 Metrics / Logs spec 对齐）
- Feishu 内部需求文档（需用户粘贴或导出）

---

## 与现有代码的关系

| 现有页面 | Drilldown 关系 |
|----------|----------------|
| [`src/views/dashboard/logs/query/`](../src/views/dashboard/logs/query/) | **高级出口**（Open in SQL Explore），不改造 |
| [`src/views/dashboard/metrics/`](../src/views/dashboard/metrics/) | PromQL 高级出口 |
| [`src/views/dashboard/traces/`](../src/views/dashboard/traces/) | Trace SQL 高级出口；Gantt 可复用 |
| [`src/perses-dashboard/`](../src/perses-dashboard/) | 固化看板；Explore 独立建设 |
| [`src/api/metrics.ts`](../src/api/metrics.ts) | 扩展 `getMetricNames({ start, end, match })` |

---

## 建议的 Active Plan 集合（开干时）

```
docs/drilldown/
├── README.md                          ← 本文件
├── summaries/confirmed-decisions.md   ← 冻结决策
├── summaries/phase0-checklist.md      ← 第一周
├── plans/01-product-explore-master    ← Master
├── plans/02-metrics-drilldown-spec    ← Metrics
├── plans/06-logs-drilldown-spec       ← Logs（已有）
└── plans/07-traces-drilldown-spec     ← 待写
```
