# 组件一致性审计：Chart 行为 & Table 组件收敛

> 范围：`src/` 下所有图表渲染入口与表格渲染入口。
> 目标：找出「同一件事被实现了多次、且行为不一致」的地方，按 影响 × 修复成本 排序。
> 采样：main @ `7603f7ae`，151 个 `.vue`，73 个 `.test.ts`。

---

## 0. TL;DR

| 维度 | 现状 | 结论 |
| --- | --- | --- |
| 图表渲染入口 | 6 套（`<Chart>` 全局 / `raw-chart` / `count-chart` / `FunnelChart` / `service-map` 直用 `vue-echarts` / Perses React） | 需要 1 套 |
| 图表配色 | 3 套（`chartTheme.json` 紫 / Grafana palette / ECharts 默认 + 硬编码 `#bdc4cd`） | 需要 1 套 |
| 图表缩放交互 | 3 套（brush-select / `timeInteraction` / 无） | 需要 1 套 |
| echarts 运行时 | 2 套（`echarts/core` 按需注册 + 3 处全量 `import * as echarts`），组件注册靠隐式副作用 | 需统一 |
| 表格引擎 | 2 套（`DataTable` Arco 2070 行 / `LogsVxeTable` vxe 1851 行） | 需二选一 |
| 表格分页 | 3 套（footer 分页 / header 分页 / load-more） | 需要 1 套 |
| 表格显示工具栏 | 3 份复制粘贴 | 抽 1 个组件 |
| 可视化基线 | 无 | **先建观察台**（测试只覆盖组合爆炸的部分） |

**最痛的 3 件事**：① 过滤操作符对列类型无感知，会生成非法 SQL；② 同一个「紧凑/换行」偏好在不同页面是不同存储 key，切页面就"变回去"；③ 日志表格和查询结果表格是两套引擎，能力互相缺失且持续漂移。

---

## 1. 现状盘点

### 1.1 图表：6 个入口

| 入口 | 引擎 | 配色来源 | 缩放交互 | 图例点击 | loading/empty 壳 |
| --- | --- | --- | --- | --- | --- |
| [`src/components/chart/index.vue`](../src/components/chart/index.vue)（全局注册为 `<Chart>`，[components/index.ts:37](../src/components/index.ts#L37)） | `vue-echarts` | `chartTheme.json` | 无 | 默认 toggle | 无 |
| [`raw-chart`](../src/components/raw-chart/index.vue#L208) | `echarts.init()` 直连 | **无主题** → 默认色板 | `timeInteraction`（拖拽缩放 + 轴平移 + 双击复位） | 默认 toggle | 无 |
| [`count-chart`](../src/components/count-chart/index.vue) | `vue-echarts` | **默认色板** + 硬编码 `#bdc4cd` | brush-select + toolbox | 无图例 | `graphic` 文字 |
| [`FunnelChart`](../src/views/dashboard/logs/query/FunnelChart.vue) | `vue-echarts` | 默认 + `#bdc4cd` | **无** | 无图例 | `graphic` 文字 |
| [`service-map`](../src/views/dashboard/drilldown/service-map/index.vue#L183) | `vue-echarts` 直用 | 读 CSS 变量（唯一主题正确的） | 无 | 无（静态 HTML 图例） | 无 |
| [`drilldown-chart-panel`](../src/views/dashboard/drilldown/components/drilldown-chart-panel.vue#L13) + [`prom-chart.ts`](../src/observability/metrics/prom-chart.ts) | `raw-chart` | Grafana palette + **硬编码轴色** | `timeInteraction` | 自定义 legend | ✅ 唯一完整的壳 |

**关键分裂**：`prom-chart.ts`（1041 行）已经把 observability 侧的 option 构造收敛得不错（`buildMainTimeseriesOption` / `buildSparklineOption` / `buildHeatmapOption`），但**只有 drilldown 走这条路**。`metrics-chart.vue`（658 行）在同一个"指标折线图"上自己又写了一遍 option 构造，配色用 `chartTheme.json` 的紫色板。

同一个「指标图表」，在 Metrics 页面是紫色板、在 Drilldown 是 Grafana 色板 → 同一个指标在两个页面是两种颜色。

### 1.2 表格：2 套引擎 + 3 套分页

| 入口 | 引擎 | 使用者 |
| --- | --- | --- |
| [`DataTable`](../src/components/data-table/index.vue)（2070 行） | Arco `a-table` | 查询结果、Traces、Flow、Pipelines、Metrics、Drilldown 查询结果 |
| [`LogsVxeTable`](../src/components/logs-vxe-table/LogsVxeTable.vue) + 11 个 util/composable（1851 行） | `vxe-table` | Logs Query、Drilldown Logs |
| [`explain-grid.vue`](../src/views/dashboard/modules/explain/explain-grid.vue#L31) | 裸 `a-table` + 7 处 `:deep(.arco-table*)` | EXPLAIN 执行计划 |

`LogsVxeTable` 的 [`utils/column-widths.ts:4`](../src/components/logs-vxe-table/utils/column-widths.ts#L4) 注释直接写着 *"parity with the legacy DataTable virtual mode"* —— 列宽启发式、上下文菜单、单元格详情弹层、时间戳格式切换、空态，全部各写了一遍。

分页三套：
- [`paginated-data-table`](../src/components/paginated-data-table/index.vue#L40)：footer 分页，`pageSize` 硬编码 20，不持久化
- [`TraceTable`](../src/views/dashboard/traces/components/TraceTable.vue#L30)：自己在 card header 里塞 `a-pagination`
- `LogsVxeTable`：load-more / 无限滚动

### 1.3 观察能力：几乎没有

- **没有任何地方能同时看到多套实现**：想判断 `DataTable` 与 `LogsVxeTable` 是否一致，得开 4 个页面、各自连上 GreptimeDB、凭记忆对比。
- `vitest.config.ts` 的 `environment: 'node'`，现有 73 个单测全是纯逻辑（option 构造、列宽估算、filter 语义）；组件渲染无测试。
- Playwright 只有一个 release 冒烟（检查页面无 console error），不覆盖交互。
- 基线还有 1 个长期红灯（`signal-binding.test.ts`），等于把测试信号静音了。

任何一个「统一组件」的重构，眼下的问题都不是"缺断言"，而是**改完看不出哪里变了**。所以阶段 0 的产出是「观察台 + 行为契约」，而不是测试套件：测试只留给组合爆炸且视觉不可见的部分（时间轴矩阵、过滤操作符矩阵、localStorage 迁移）。

---

## 2. P0 — 用户可直接感知 / 正确性问题（小改动）

### P0-1 过滤操作符对列类型无感知，会生成非法 SQL

三处实现，三种语义：

| 位置 | 行为 |
| --- | --- |
| [`data-table/index.vue:1426`](../src/components/data-table/index.vue#L1426) | 非时间非 JSON 列一律给 `['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE']` |
| [`use-logs-context-menu.ts:39`](../src/components/logs-vxe-table/composables/use-logs-context-menu.ts#L39) | `sqlBuilderFilterOps`：时间 `>=/<=`，其他 8 项 |
| [`use-logs-context-menu.ts:52`](../src/components/logs-vxe-table/composables/use-logs-context-menu.ts#L52) | `drilldownFilterOps`：用 `=~` / `!~`（chip 语义） |
| [`observability/filters.ts:64`](../src/observability/filters.ts#L64) | ✅ `filterOpsForType`：按 `data_type` 返回 `=`/`!=`/`=~`/`!~` 或数值比较或布尔，**有单测** |

后果：
- Traces 表（唯一开启 `showContextMenu` 的 DataTable 消费者）在 String 列上给 `>` `<`，在数值列上给 `LIKE` → 点下去生成跑不通的 SQL。
- 同样是「点单元格加过滤」，Logs Query 用 `LIKE`，Drilldown 用 `=~`。

**建议**：删掉两处硬编码列表，`DataTable` 与 `LogsVxeTable` 都改为调 `filterOpsForType`（drilldown 侧保留 op 别名映射）。改动 ~30 行，可立刻加单测。

### P0-2 「紧凑行高 / 换行」偏好分裂成多个存储位

| 页面 | 紧凑行 | 换行 | 持久化 |
| --- | --- | --- | --- |
| SQL 查询结果（[data-view](../src/views/dashboard/modules/data-view/index.vue#L156)） | `uiConfig.compactRows` | **本地 `ref(false)`** | 紧凑 ✅ / 换行 ❌ |
| Logs Query | `uiConfig.logsTableCompactRows` | `uiConfig.logsTableWrapLines` | ✅ |
| Drilldown Logs | `uiConfig.logsTableCompactRows` | `uiConfig.logsTableWrapLines` | ✅ |

同一个 `类型定义`（[types.ts:35](../src/store/modules/app/types.ts#L35) 与 [:53-56](../src/store/modules/app/types.ts#L53)）里存在 `compactRows` 和 `logsTableCompactRows` 两个概念相同的 key。用户在 Logs 页面勾了「紧凑行高」，切到 SQL 结果页又变回宽松行高。

**建议**：合并为 `tableCompactRows` / `tableWrapLines` / `tableColumnMode` 三个全局 key，通过一个 `useTableDisplayPrefs()` 统一读写（正好和 P0-3 的工具栏一起做）。

### P0-3 表格显示工具栏三份复制

同一段 UI（单列 / 显示 key / 紧凑 / 换行 / 列显隐下拉 + Select All / Deselect All）在三个文件里各写一份：

- [logs/query/index.vue:94-131](../src/views/dashboard/logs/query/index.vue#L94)
- [drilldown/logs/logs-main-view.vue:10-45](../src/views/dashboard/drilldown/logs/logs-main-view.vue#L10)
- [TraceTable.vue:20-39](../src/views/dashboard/traces/components/TraceTable.vue#L20)（列显隐部分）

配套逻辑（`selectableColumns` / `visibleSelectableColumnNames` / `selectAllColumns` / `deselectAllColumns` / `hiddenColumnCount`）也各有一份。三份都是硬编码英文 `Select All` / `Deselect All`（未走 i18n），在 zh-CN / ja-JP 下会露出英文——这也是"复制而不同步"的典型症状。

**建议**：抽 `<TableDisplayToolbar :columns :hidden :mode>` + `useTableDisplayPrefs()`，三个页面替换。约 -150 行重复代码。

### P0-4 时间轴标签三套 formatter

| 位置 | 规则 |
| --- | --- |
| [`chart-time-axis.ts:223`](../src/utils/chart-time-axis.ts#L223) | Grafana 式：按 tick 间隔对齐（`14:32` / `11-13` / `14:32:05`） |
| [`metrics-chart.vue:220`](../src/views/dashboard/metrics/components/metrics-chart.vue#L220) | 自己按 span 阈值判断（本文件的私有实现） |
| [`count-chart/index.vue:80`](../src/components/count-chart/index.vue#L80) 与 [`data-chart.vue:245`](../src/views/dashboard/modules/data-view/components/data-chart.vue#L245) | 裸 `formatDateTime(value, 'TimestampMillisecond')`，不随跨度变化 |

同一个时间点在三个图里显示成三种格式。**建议**：全部改用 `formatTimeAxisLabel`，删掉 `metrics-chart` 的私有实现。

### P0-5 图表轴色硬编码，且与设计 token 脱钩

`rgba(71, 52, 96, …)` 在 [prom-chart.ts:292-294](../src/observability/metrics/prom-chart.ts#L292) 和 [metrics-chart.vue:107-109](../src/views/dashboard/metrics/components/metrics-chart.vue#L107) 各硬编码一次，而设计 token 里已有 `--gpt-text-primary` / `--gpt-border-default` / `--gpt-border-subtle`。

隐患：这些值假设浅色背景。当前 dark theme 在 store 里可配（`isDark`），虽然设置界面没暴露入口，但 observability 侧已经在按 `isDark` 切 series 配色（[series-colors.ts](../src/observability/metrics/series-colors.ts#L39)）——只有轴色不跟着变，一旦开启 dark theme 轴标签会直接看不见。

**建议**：轴色改为从 `getComputedStyle` 读 CSS 变量（`service-map` 已这么做，可复用），或在 `prom-chart.ts` 里抽 `resolveChartAxisColors(isDark)`。

---

## 3. P1 — 结构性收敛（需要排期）

### P1-1 表格双引擎并存

`DataTable`(Arco) 与 `LogsVxeTable`(vxe) 各自实现：列宽启发式、虚拟滚动、上下文菜单、单元格详情、时间戳格式切换、空态、列显隐。两边能力互补缺失：

- `DataTable` 有：合并列（`merged` / `merged-with-keys`）、JSON 列操作菜单、单元格展开 popover、`column-resizable` 拟合算法、`activeRowKey` 高亮
- `LogsVxeTable` 有：load-more 无限滚动、`wrap` 变高行、trace_id 链接列、filter menu 双语义

导致 Logs 用不了合并列的 JSON 操作，Traces 用不了 load-more。

**引擎决策已完成**：统一到 **vxe**，详见 [table-engine-evaluation.md](./table-engine-evaluation.md)。结论要点：

- 反向统一（vxe → Arco）不可行，两条独立硬约束：① Arco 虚拟列表只支持固定行高，而"换行 + 虚拟滚动"是日志表已上线功能；② 虚拟模式下表头与内容体是两个表格，宽度靠"表头 `offsetWidth` 快照 → 内容体内联 px"同步 → 拖动列宽无实时预览（要整表重挂）、超宽时累积错位（只能 `overflow-x: hidden`）。本仓为此外挂了四套 workaround，日志表当初迁 vxe 就是这次实践的产物。
- `DataTable` 的虚拟列表路径**没有任何消费者使用**（全仓只有 `a-select` / `a-tree` 用 `virtual-list-props`），那 43 处符号引用是死代码。
- 真正的迁移工作量集中在 4 项：列宽（估算 → 测量）、JSON 列 UX、语义表头、裁切展开交互；合计 ~6.5 人日。
- 目标形态不是"`LogsVxeTable` 替代 `DataTable`"，而是新建 `DataGrid`（vxe 实现）并继承 `DataTable` 的 props 契约，最后两个旧组件都退役。

### P1-2 图表入口 6 → 1，双 echarts 运行时合一

两个独立问题：

**a) 入口太多**。`<Chart>` 是全局注册的（`components/index.ts:37`），[`data-chart.vue:26`](../src/views/dashboard/modules/data-view/components/data-chart.vue#L26) 通过它渲染，并且**传了一个该组件根本不存在的 `update-options` prop**（`updateOptions` 从 `config` 导入，静默失效）。`count-chart` / `FunnelChart` 又各自直接 `import VCharts from 'vue-echarts'`。

**b) 两套 echarts 运行时，且注册是"意外生效"的**。[components/index.ts:21](../src/components/index.ts#L21) 走 `echarts/core` 按需注册（只注册了 Bar/Graph/Line/Scatter + Grid/Tooltip/Legend/DataZoom/Graphic），而 [`raw-chart`](../src/components/raw-chart/index.vue#L18)、[`count-chart`](../src/components/count-chart/index.vue#L14)、[`FunnelChart`](../src/views/dashboard/logs/query/FunnelChart.vue#L13) 用 `import * as echarts from 'echarts'` 全量引入。

关键点：echarts 全量入口在模块求值时会 `use()` 全部图表与组件（`node_modules/echarts/index.js:75-193`），并且与 `echarts/core` **共享同一个全局注册表**。所以现在能正常工作，靠的是"某个模块碰巧 import 了全量包"这个隐式副作用：

- [`prom-chart.ts:582`](../src/observability/metrics/prom-chart.ts#L582) 的 `visualMap` + `type: 'heatmap'`（指标详情热图 / Traces 热图）、`count-chart` 的 `toolbox`，都**不在**显式注册列表里；
- 一旦为了减小 bundle 把某处全量 import 换成按需 import（这是很自然的优化），这些组件会**静默失效**，且现有测试完全发现不了（见 1.3）。

同时 bundle 里同时存在按需与全量两份 echarts 代码，体积被白白放大。

**建议**：以 `raw-chart` 为唯一渲染器（它已支持 `timeInteraction`、`brushSelect`、resize、`ready`/`datazoom` 事件），把 `components/chart` + `hooks/chart-option.ts` 废弃；所有 option 构造收敛到 `prom-chart.ts` 风格的 builder；echarts 统一走 `echarts/core`，把 Heatmap/VisualMap/Toolbox 等**实际在用的组件显式注册**，然后删掉全部全量 import。

### P1-3 图表交互 / 图例语义不统一

| 行为 | metrics-chart | drilldown | count-chart | data-chart |
| --- | --- | --- | --- | --- |
| 拖拽缩放 | brush-select + inside zoom | `timeInteraction` | brush-select | 无 |
| 双击复位 | ✅（`time-interaction.ts:751`） | ✅ | ❌ | ❌ |
| 图例点击 | **solo**（[use-chart-legend-solo](../src/components/raw-chart/use-chart-legend-solo.ts)） | **solo / 过滤** | 默认 toggle | 默认 toggle |
| 时间范围回写全局 | `@datazoom` | `@time-range-change` | `@datazoom` | 无 |

`legend-solo` 目前只有 2 个消费者（metrics-chart、logs-volume-mini-chart）。同一张图里「点图例」到底是只看这一条、还是过滤、还是普通显隐，用户学不会。

**建议**：把 `timeInteraction` + `legend-solo` 下沉为 `raw-chart` 的默认能力（`interaction="zoom" \| "none"`、`legend-click="solo" \| "filter"`），页面只声明意图。

### P1-4 同一个「日志量直方图」两份实现

| | [`count-chart`](../src/components/count-chart/index.vue)（Logs Query） | [`logs-volume-mini-chart`](../src/views/dashboard/drilldown/logs/logs-volume-mini-chart.vue)（Drilldown） |
| --- | --- | --- |
| 配色 | 硬编码 `#bdc4cd` | severity 语义色（[level-color.ts](../src/observability/logs/level-color.ts)） |
| 图例 | 无 | 侧边/底部 legend，可点击过滤 |
| 缩放 | toolbox + brush | 拖拽 + 轴平移 |
| 数据 | 自己拼 `date_bin` SQL | `fetchLogVolumeByColumn` 适配器 |
| 空态 | `graphic` 文字 | `drilldown-chart-panel` 的 empty message |

Logs Query 和 Drilldown Logs 是相邻的两个入口，表现完全不同。**建议**：Logs Query 的 volume 图改为复用 `drilldown-chart-panel` + `buildLogVolumeBarsOption`（[volume-bars.ts](../src/observability/logs/volume-bars.ts)），`count-chart` 退化为一个数据适配器。

---

## 4. P2 — 卫生问题

1. **死代码 / 无效配置**
   - [`hooks/chart-option.ts`](../src/hooks/chart-option.ts) + [`hooks/themes.ts`](../src/hooks/themes.ts)：从 `hooks/index.ts` 导出但**无任何消费者**。
   - [`components/chart/index.vue`](../src/components/chart/index.vue)：无 loading/empty/theme 参数，只被 `data-chart` 隐式用。
   - `data-chart.vue:26` 的 `:update-options` —— 组件未声明该 prop，永久静默失效。
   - `count-chart` 的 `toolbox` 配置 / `prom-chart` 的 `visualMap`+`heatmap` —— 未显式注册，依赖全量 import 的副作用才生效（见 P1-2b）。
2. **分页三套**（见 1.2）：`PaginatedDataTable` 的 `pageSize=20` 不持久化、不可配；`TraceTable` 自建分页；日志表 load-more。建议统一为「表格分页模式」枚举 + 一个 `TablePager` 组件。
3. **per-page 表格样式覆写**：`:deep(.data-table | .arco-table | .logs-vxe*)` 共 **89 处**（组件内部 73、页面侧 16：`explain-grid` 7、`PipeFileView` 2、`logs-detail` 2、`label-value-panel` 2、`data-view` / `metrics` / `LogsTable` 各 1）。建议把可复用规则上提到 `src/assets/style/tableList.less`，页面只保留真正的定位/尺寸差异。
4. **`explain-grid.vue` 裸用 `a-table`**：EXPLAIN 计划的表格样式独立维护，会随 `DataTable` 的样式演进而漂移。

---

## 5. 建议路线

**阶段 0（先做，3.5 天）— 可视化基线** → 详细计划见 [phase-0-visual-baseline-plan.md](./phase-0-visual-baseline-plan.md)
- 0A（1.5d）组件实验室：dev-only 独立页面，把 4 张表 × 5 个图表 × 各种状态并排渲染，不需要连 GreptimeDB。
- 0B（0.5d）行为契约单：定义"应有行为"，把"看出差异"变成"能判定谁对"。
- 0C（1d）3 个可肉眼验证的修复。
- 0D（0.5d）只保留 3 个"眼看不出来"的测试（时间轴矩阵 / 过滤操作符矩阵 / 偏好迁移）+ 修基线红灯。
- 注：不引入 jsdom 与组件挂载测试（详见改版说明）。

**阶段 1（1 PR，2-3 天）— P0 快速收敛**
1. 过滤操作符统一走 `filterOpsForType`
2. `useTableDisplayPrefs()` 统一偏好 key + 迁移旧 localStorage
3. `<TableDisplayToolbar>` 抽取，替换 3 处
4. 时间轴 formatter 统一
5. 图表轴色改为读 CSS 变量

> 这一阶段不动引擎、不动渲染器，风险最低，收益最直接。

**阶段 2（2-3 PR，1 周+）— 表格展示层合一**
- `TableCell` / `useCellContextMenu` / `useColumnWidthFit` 抽公共层，两个引擎共用
- `DataTable` 对外 API 增加 `paginate | loadMore` 模式
- 之后再决策是否换掉其中一个引擎

**阶段 3（2 PR，1 周+）— 图表入口合一**
- 废弃全局 `<Chart>`，统一 `raw-chart`
- `prom-chart.ts` 升级为唯一 option 工厂（含 time/axis/tooltip/legend 基础层）
- Logs Query volume 图迁到 `drilldown-chart-panel`
- echarts 单运行时

---

## 6. 验收标准

- 同一时间范围在任意两个图表里，x 轴标签格式一致。
- 「紧凑行高 / 换行 / 列显隐」在 Logs Query、Drilldown Logs、SQL 结果页三处共享同一状态，且刷新后保持。
- 任意表格的单元格上下文菜单，对同一列类型给出同一组操作符，且生成的 SQL 可执行。
- `rg "import \* as echarts from 'echarts'"` 为 0。
- `rg "a-pagination|load-more" src/views` 命中数下降到一个分页抽象。
- 组件实验室里 12 个 case 全部能渲染；每个收敛 PR 附带「改前/改后」同 case 截图。
- 仅 3 处必须用机器判定：时间轴格式矩阵、过滤操作符矩阵、偏好迁移。
