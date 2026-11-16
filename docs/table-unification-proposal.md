# 表格统一：关键特性评估与实现方案

> 范围：`DataTable`（Arco `a-table`，[`data-table/index.vue`](../src/components/data-table/index.vue)）与 `LogsVxeTable`（`vxe-table@4.21.10`，[`LogsVxeTable.vue`](../src/components/logs-vxe-table/LogsVxeTable.vue)）的统一。
> 重点：列宽、虚拟列表、表格宽度策略、分页。原则：少自定义，能交给浏览器 / 引擎内建能力的就不自己写。
> 与 [`table-engine-evaluation.md`](./table-engine-evaluation.md) 独立成文，差异见 §9。

---

## 0. 结论

1. **统一到 vxe，不自建表格。** 以 `LogsVxeTable` 为底座泛化成通用组件（下称 `DataGrid`），DataTable 的 8 个消费方迁过来后删除 DataTable。
2. **只有虚拟列表需要我们介入测量。**
   - **非虚拟（含所有分页表）**：列宽完全交给 vxe 的 `auto` 列——vxe 在每次数据变化（含翻页）时自己用浏览器 `scrollWidth` 重新测量并分配。我们只提供列配置和一条测量期 CSS，**不写测量代码、不写分配函数**。
   - **虚拟**：未渲染行测不到，且 vxe 会随滚动反复重测（只增不减）。所以首屏让 vxe 测一次，然后把结果冻结成 px 列配置。
3. **宽度策略沿用原有规则**：总宽没超过容器 → 按自然宽度并扩充到容器宽；超过容器 → 才把长列限制在 600px，表格横向滚动。用 vxe 列配置 + 一个"溢出才封顶"的 class 切换表达（§3.2），DataTable 的 `fitColumnWidths` 不再需要。
4. **分页做成 `DataGrid` 的内建能力**，取代现在 `PaginatedDataTable` 和 `TraceTable` 各自的一份客户端分页实现；与 load-more、虚拟滚动三选一（§5.7）。
5. 当前 `LogsVxeTable` 里"vxe 测不准列宽"的问题**不是 vxe 的限制，是我们插槽 CSS 造成的**，一条 `[data-calc-col]` 样式即可修复（§3.1）。
6. 收益与不足见 §6、§7。一句话：**两套引擎变一套、日志表列宽从"猜"变"测"、大结果集不再卡、分页一套实现；代价是 SQL 结果页多加载约 200KB（gzip）的 vxe，拖拽列宽从实时预览变为"参考线 + 松手生效"，分页表翻页时列宽会随当页内容变化。**

---

## 1. 核心区分：虚拟 vs 非虚拟

| 约束                    | 非虚拟（含分页表）                    | 虚拟                              |
| ----------------------- | ------------------------------------- | --------------------------------- |
| 所有行在 DOM 中         | ✅                                    | ❌ 只有可视窗口 + buffer          |
| 列宽由谁测              | vxe 自动（数据加载 / 翻页后自动重排） | vxe 测首屏，**我们冻结**          |
| 列宽需在用户滚动前确定  | ❌                                    | ✅ 否则滚动时越滚越宽             |
| 行高                    | 浏览器自然排版（换行即变高）          | 固定行高或逐行测量                |
| 是否需要显式像素高度    | ❌ `height="100%"` 即可               | ✅ vxe 纵向虚拟时无高度兜底 300px |
| 横向虚拟（`virtual-x`） | 关                                    | 冻结后可开                        |

源码依据：

- 数据加载后 vxe 执行 `handleRecalculateStyle(false, true, true)`，第二个参数 `reWidth=true` 即重新测量 auto 列（[`table.js:3870-3875`](../node_modules/vxe-table/es/table/src/table.js#L3870)）。翻页 = 换 `data`，自动生效。
- 非虚拟时测量从 0 开始（`colWidth = (scrollYLoad ? column.renderAutoWidth : 0)`，[`table.js:1818`](../node_modules/vxe-table/es/table/src/table.js#L1818)），每页按当页内容重新得出；虚拟时以上次结果为下限，所以只增不减。

---

## 2. 消费方画像

| 消费方                                                                                                                  | 现在的行数控制                                                           | 高度模型                         | 统一后           |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- | ---------------- |
| Logs Query 主表（[`LogsTable.vue`](../src/views/dashboard/logs/query/LogsTable.vue)）                                   | load-more（keyset），可达数千~数万                                       | 面板内滚动                       | load-more + 虚拟 |
| Drilldown 日志主视图（[`logs-main-view.vue`](../src/views/dashboard/drilldown/logs/logs-main-view.vue)）                | load-more                                                                | 面板内滚动                       | load-more + 虚拟 |
| Drilldown 日志预览（[`label-value-panel.vue`](../src/views/dashboard/drilldown/logs/label-value-panel.vue)）            | 固定小预览，`:virtual="false"`                                           | 面板内                           | 全量，非虚拟     |
| SQL 结果（`data-view` → `QueryResultTable` → [`PaginatedDataTable`](../src/components/paginated-data-table/index.vue)） | **客户端分页 A**：底部 `a-pagination`（mini，总数/跳页/每页条数），20 行 | 面板内滚动                       | 分页，非虚拟     |
| Markdown 代码块结果（`code-editor` → `PaginatedDataTable`）                                                             | 同上                                                                     | 同上                             | 分页，非虚拟     |
| Traces 列表（[`TraceTable.vue`](../src/views/dashboard/traces/components/TraceTable.vue)）                              | **客户端分页 B**：卡片标题栏 `a-pagination simple`，10/20/50/100         | 面板内                           | 分页，非虚拟     |
| Pipeline 预览（[`PipeFileView.vue`](../src/views/dashboard/logs/pipelines/PipeFileView.vue)）                           | 全量（小）                                                               | 面板内                           | 全量，非虚拟     |
| Flow 列表（[`flow/index.vue`](../src/views/dashboard/flow/index.vue)）                                                  | 全量（小）                                                               | **页面滚动**（`gpt-table-page`） | 全量，非虚拟     |
| Metrics 表（[`metrics/index.vue`](../src/views/dashboard/metrics/index.vue)）                                           | 全量，**序列数可能上千**                                                 | 面板内                           | 全量，超阈值虚拟 |
| Drilldown 指标结果（[`query-results-panel.vue`](../src/views/dashboard/drilldown/metrics/query-results-panel.vue)）     | 全量                                                                     | 面板内                           | 全量，超阈值虚拟 |

要点：

- DataTable 的消费方**没有一个**传 `virtual-list-props`，DataTable 的虚拟路径是死代码。
- 分页现在有**两份实现**，逻辑重复但行为不一致：A 有 `activeRowKey` 跟随翻页、`__globalRowIndex`，B 没有；A 的分页器在底部，B 在标题栏；A 每页条数用 Arco 默认选项，B 是 10/20/50/100。
- `metrics` / `query-results-panel` 传的 `:pagination="false"` 是透传给 Arco 的空操作。

---

## 3. 关键特性评估（vxe 4.21.10，源码核实）

### 3.1 列宽测量与测量期 CSS

vxe 对 `width: 'auto'` / `minWidth: 'auto'` 的列，在根节点上临时加 `data-calc-col="Y"`，读每个 `.vxe-cell--wrapper` 的 `scrollWidth`（[`table.js:1796-1845`](../node_modules/vxe-table/es/table/src/table.js#L1796)）。

**为什么 `LogsVxeTable` 当前测不准**（[`column-widths.ts:6-9`](../src/components/logs-vxe-table/utils/column-widths.ts#L6) 注释）：插槽 `.logs-vxe-cell-inner { width: 100% }` + `.logs-vxe-cell-text { overflow: hidden }`，内容被裁在 wrapper 内 → `scrollWidth == 当前宽度`。

**修复**：利用 vxe 的测量钩子，测量期让内容按自然宽度展开；封顶也在这里用 CSS 完成（见 §3.2）：

```less
:deep(.vxe-table[data-calc-col]) {
  .dg-cell-inner {
    width: max-content;
  }
  .dg-cell-text {
    overflow: visible;
    text-overflow: clip;
  }
}

// 溢出才封顶：只有 DataGrid 判定"自然宽度总和 > 容器"后才加这个 class
.data-grid--capped :deep(.vxe-table[data-calc-col]) .dg-cell-inner {
  max-width: var(--dg-col-max, 600px);
  overflow: hidden;
}
```

| 模式           | 评估                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 非虚拟         | ✅ 修复 CSS 后直接用，vxe 每次数据变化自动重测                                                                                                                          |
| 虚拟           | ⚠️ 只能用首屏一次：`handleSyncScroll` 每次纵向滚动都会重测 auto 列且只增不减（[`table.js:4535-4542`](../node_modules/vxe-table/es/table/src/table.js#L4535)）→ 必须冻结 |
| 横向虚拟开启时 | ❌ 未渲染列测不到 → 非虚拟关闭 `virtual-x`；虚拟模式冻结后再开                                                                                                          |

### 3.2 宽度分配策略（沿用原有规则）

**规则**（与 DataTable `fitColumnWidths` 的语义一致）：

- 所有列自然宽度之和 **≤ 容器**：不封顶，列宽 = 自然宽度，剩余空间扩充到容器宽。
- 所有列自然宽度之和 **> 容器**：长列封顶 600px；封顶后仍超出 → 横向滚动；封顶后有剩余 → 扩充到容器宽。

**vxe 的分配规则**（[`autoCellWidth` `1854-1996`](../node_modules/vxe-table/es/table/src/table.js#L1854)，分桶见 [`analyColumnWidth` `9702-9748`](../node_modules/vxe-table/es/table/src/table.js#L9702)）：

| 列配置             | 宽度                 | 是否吸收剩余空间 |
| ------------------ | -------------------- | ---------------- |
| 用户拖拽过         | 拖拽值（优先级最高） | 否               |
| `width: 'auto'`    | 自然宽               | 否               |
| `width: 120`       | 固定                 | 否               |
| `minWidth: 'auto'` | ≥ 自然宽             | ✅ 平分剩余      |
| `minWidth: 120`    | ≥ 120                | ✅ 平分剩余      |

**映射**：

| 原有能力                             | vxe 表达                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 扩充到容器宽，`last-column`（默认）  | 其余列 `width: 'auto'`，最后一列 `minWidth: 'auto'` → 剩余全给最后一列                                                         |
| 扩充到容器宽，`proportional`（flow） | 所有列 `minWidth: 'auto'` → vxe **平分**剩余（不是按比例，flow 列少、差异可接受）                                              |
| 超出容器才封顶 600                   | 测量期 CSS `max-width`，由 `.data-grid--capped` 控制（§3.1）；**不用** vxe 的 `maxWidth`（它无条件生效，且会让列退出剩余分配） |
| 超出容器横向滚动                     | vxe 原生；header/body 的 `<colgroup>` 来自同一 column store，不会错位                                                          |

**"溢出才封顶"的判定**（唯一的 JS，约 15 行）：

```ts
// 每个新结果集 / 新页 / 列集合变化：先不封顶，让 vxe 按自然宽度排；溢出则封顶重排一次
async function relayout() {
  capped.value = false
  await grid.recalculate(true)
  const total = fieldNames.value.reduce((sum, f) => sum + grid.getColumnWidth(f), 0)
  if (total > bodyClientWidth() + 1) {
    capped.value = true
    await grid.recalculate(true)
  }
}
```

- `getColumnWidth` 是 vxe 公开 API；"不溢出"时吸收列已被扩充到容器宽，总和 == 容器宽，判定天然成立。
- 与 DataTable 的细微差异：封顶后剩余空间 DataTable 会**先还给被封顶的列**，这里是交给吸收列。只发生在"封顶前溢出、封顶后又有富余"的窄区间。
- 容器尺寸变化：vxe `autoResize` 默认开启，按当前封顶状态自动重排；封顶状态只在数据 / 列变化时重新判定，避免拖动窗口时反复切换。

### 3.3 拖拽列宽

- 拖动中只移动参考线，**松手时**写入 `resizeWidth` 并重排（[`table.js:9870-9895`](../node_modules/vxe-table/es/table/src/table.js#L9870)）。表头和内容体同时更新，不会错位。
- 双击拖拽手柄自适应列宽（`isDblclickAutoWidth`，[`9903-9945`](../node_modules/vxe-table/es/table/src/table.js#L9903)）。
- 拖拽值存在 vxe 列对象上，翻页（只换 `data`）**保留**；`columns` 数组换新对象会重建列、丢失拖拽值，所以列配置只在列集合变化时重建（沿用 `areWidthRulesEqual` 的思路）。

### 3.4 高度与滚动

| 项             | 非虚拟                                                                                                                               | 虚拟                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 高度           | `height="100%"`：vxe 读父元素高度（[`table.js:1480`](../node_modules/vxe-table/es/table/src/table.js#L1480)），`autoResize` 默认开启 | 同左；父元素无高度时兜底 300px（[`1789-1791`](../node_modules/vxe-table/es/table/src/table.js#L1789)） |
| 页面滚动(flow) | 不传 `height`，按内容撑开                                                                                                            | 不适用                                                                                                 |
| 横向滚动       | header/body 分属不同容器，`scrollLeft` 同步；列宽来源单一                                                                            | 同左                                                                                                   |

### 3.5 行高 / 换行

| 项       | 非虚拟                                  | 虚拟                                                      |
| -------- | --------------------------------------- | --------------------------------------------------------- |
| 不换行   | `show-overflow="ellipsis"` + 固定行高   | 同左                                                      |
| 换行     | `show-overflow=false`，vxe 逐行测量行高 | 同左；未渲染行用估计值，`recalcRowHeight` 采样 100 行修正 |
| 切换换行 | `:key` 整表重挂（保留）                 | 同左                                                      |

### 3.6 渲染能力对齐（DataTable 有、`LogsVxeTable` 缺）

| 能力                                  | 做法                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| JSON 列 pretty / hideNulls / 表头菜单 | `slots.header` + `slots.default`，复用 [`json-display`](../src/utils/json-display.ts) |
| 语义表头（`gpt-semantic-th`）         | `slots.header`                                                                        |
| 空态图标                              | `#empty` 插槽放 `a-empty` + 图标                                                      |
| 自定义列插槽 `column-*`               | 组件内把 `$slots` 映射成 vxe 列的 `slots.default`（§5.9）                             |
| 单元格复制按钮（`enableCellCopy`）    | 合并进行尾 `⋮` 菜单                                                                   |
| 截断内容查看                          | 单元格点击详情（`useLogsCellDetail`，只对实际被截断的单元格响应）+ 双击列边自适应     |

---

## 4. `LogsVxeTable` 现有自定义代码盘点

| 自定义逻辑                                | 属于        | 统一后                                        |
| ----------------------------------------- | ----------- | --------------------------------------------- |
| 字符估算列宽（`column-widths.ts`）        | 虚拟        | 改为"vxe 测首屏 → 冻结"；估算仅在无数据时兜底 |
| "最宽列吸收剩余"规则                      | 虚拟        | 由列配置表达（§3.2）                          |
| `areWidthRulesEqual` 保持 columns 引用    | 通用        | 保留                                          |
| `useElementSize → gridHeight`             | 通用        | 改 `height="100%"`，删除                      |
| 宽度 watch → `recalculate(true)`          | 通用        | 删除，依赖 `autoResize`                       |
| `recalcRowHeight` 采样                    | 虚拟 + 换行 | 保留，仅虚拟时执行                            |
| `:key` 换行切换重挂                       | 通用        | 保留                                          |
| `virtual-x` 无条件开启                    | 通用        | 仅虚拟模式、冻结后开启                        |
| load-more（`use-logs-load-more`）         | 日志        | 保留，作为行数控制的一种模式（§5.7）          |
| 右键 / `⋮` 菜单、单元格详情、时间格式切换 | 通用        | 保留，去掉 `logs-` 前缀                       |

---

## 5. 实现方案

### 5.1 组件形态

```
src/components/data-grid/
  DataGrid.vue                  ← 由 LogsVxeTable.vue 泛化
  DataGridPager.vue             ← 统一分页器（a-pagination + 现 PaginatedDataTable 的样式）
  composables/
    use-time-format.ts          ← use-logs-time-format
    use-cell-detail.ts          ← use-logs-cell-detail
    use-context-menu.ts         ← use-logs-context-menu
    use-load-more.ts            ← use-logs-load-more
    use-pagination.ts           ← 新：合并 PaginatedDataTable + TraceTable 的分页逻辑
    use-column-layout.ts        ← 新：列配置、溢出封顶判定、虚拟冻结
  utils/
    column-estimate.ts          ← 原 column-widths.ts，仅无数据兜底
    table-data.ts / cell-text.ts / vxe-columns.ts
  renderers/                    ← 内置渲染器，见 §5.9
    index.ts                    ← resolveHeaderRenderer / resolveCellRenderer
    header-time.ts / header-json.ts / header-semantic.ts
    cell-time.ts / cell-json.ts / cell-link.ts / cell-merged.ts / cell-text.ts
```

`QueryResultTable` 保留外壳；`PaginatedDataTable` 删除（能力并入 `DataGrid`）。

### 5.2 Props 契约

- 数据：`data` `columns` `displayedColumns` `tsColumn` `columnMode`
- 行为：`tsCellDetail` `showContextMenu` `filterMenuKind` `linkColumn` `activeRowKey`（**始终是全量数据中的下标**） `enableCellCopy`
- 布局：`size` `showHeader` `wrapLine` `columnResizable`（默认 true） `leftoverStrategy`（`last-column` | `proportional`）
- 行数控制（三选一，见 §5.7）：`pagination` / `hasMore` + `loadingMore` / 都不传（全量）
- 虚拟：`virtual?: boolean | 'auto'`（默认 `'auto'`），`virtualThreshold`（默认 500）
- 删除：`enable-cell-expand`、`virtual-list-props`、`virtualColumnsClipped` 事件、透传的 Arco `pagination` / `bordered`

### 5.3 模式决策

```ts
const rowMode = computed(() => (props.pagination ? 'paged' : props.hasMore !== undefined ? 'load-more' : 'all'))

// 每个结果集决定一次；load-more 追加不重新决策；分页永远非虚拟
const isVirtual = computed(() => {
  if (rowMode.value === 'paged') return false
  if (props.virtual !== 'auto') return props.virtual
  return rowCountAtResultStart.value > props.virtualThreshold
})
```

### 5.4 列配置（非虚拟 + 虚拟共用）

```ts
function columnRule(field: string, index: number, total: number) {
  if (isVirtual.value && frozen.value[field]) {
    return isAbsorber(index, total) ? { minWidth: frozen.value[field] } : { width: frozen.value[field] }
  }
  return isAbsorber(index, total) ? { minWidth: 'auto' } : { width: 'auto' }
}
// isAbsorber: last-column → 最后一列；proportional → 所有列
```

非虚拟只有这一步加 §3.2 的 `relayout()`，此外没有任何列宽代码。

### 5.5 虚拟冻结（只在虚拟模式）

```ts
// 新结果集首屏渲染后执行一次；之后 frozen 为 px，vxe 滚动时不再重测
async function freeze() {
  if (props.data.length === 0) return applyEstimate()
  await relayout() // 与非虚拟相同：自然宽 → 溢出才封顶
  frozen.value = Object.fromEntries(fieldNames.value.map((f) => [f, naturalWidthOf(f)]))
  widthsFrozen.value = true // 之后才开启 virtual-x
}
```

- `naturalWidthOf`：非吸收列 = `getColumnWidth`；吸收列取扣除剩余分配前的宽度（冻结前临时把吸收列也设为 `width: 'auto'` 测一次）。冻结后吸收列是 `minWidth: px`，容器变宽时 vxe 继续把剩余给它。
- 冻结会重建一次列配置，发生在首屏、用户交互之前，不影响拖拽。
- load-more 追加不重新冻结，列宽稳定。

### 5.6 Grid 配置

```ts
const gridProps = computed(() => ({
  height: props.height || (pageScroll.value ? undefined : '100%'),
  autoResize: true,
  showOverflow: props.wrapLine ? false : 'ellipsis',
  columnConfig: {
    resizable: props.columnResizable && props.columnMode === 'separate',
    autoOptions: { isCalcHeader: true, isCalcBody: true },
  },
  resizableConfig: { isDblclickAutoWidth: true },
  virtualYConfig: { enabled: isVirtual.value, gt: 0 },
  virtualXConfig: {
    enabled: isVirtual.value && widthsFrozen.value && props.columnMode === 'separate' && !props.wrapLine,
    gt: 0,
  },
  rowConfig: props.wrapLine ? { isHover: true } : { isHover: true, height: rowHeight.value },
}))
```

### 5.7 行数控制：分页 / load-more / 全量

三种模式互斥，由 `DataGrid` 统一处理，消费方不再自己切片数据。

| 模式      | 适用                                        | 虚拟         | 列宽                       |
| --------- | ------------------------------------------- | ------------ | -------------------------- |
| paged     | SQL 结果、代码块结果、Traces                | 永远关       | vxe 每页自动重排（§1）     |
| load-more | 日志主表、drilldown 日志                    | 开           | 首屏冻结，追加不变         |
| all       | Pipeline、Flow、日志预览、metrics、指标结果 | 超阈值自动开 | 非虚拟自动；虚拟则首屏冻结 |

**分页 API**：

```ts
pagination?: false | {
  pageSize?: number            // 默认 20
  pageSizeOptions?: number[]   // 默认 [10, 20, 50, 100]
  placement?: 'bottom' | 'none' // none：只分页不渲染分页器，由外部用 v-model 控制
  simple?: boolean             // 紧凑样式
}
// v-model:page / v-model:page-size 可选，用于外部显示 "showing x-y" 或自定义分页器位置
// @page-change(page, pageSize)
```

**`use-pagination.ts` 合并两份现有逻辑**：

| 行为                                            | PaginatedDataTable    | TraceTable | 统一后                            |
| ----------------------------------------------- | --------------------- | ---------- | --------------------------------- |
| 客户端切片                                      | ✅                    | ✅         | ✅                                |
| 新结果集回到第 1 页                             | ✅                    | ✅         | ✅                                |
| 改每页条数回到第 1 页                           | ✅                    | ✅         | ✅                                |
| `activeRowKey` 所在行不在当前页时自动翻页       | ✅                    | ❌         | ✅                                |
| 行号用全量下标（详情抽屉上一条 / 下一条可跨页） | ✅ `__globalRowIndex` | ❌         | ✅ 统一为 `__rowIndex` = 全量下标 |
| 翻页后滚回顶部                                  | ❌                    | ❌         | ✅ `grid.scrollTo(0, 0)`          |
| 右键过滤 / 复制取的是原始行                     | —                     | —          | ✅ 按全量下标取原始行             |

**分页器**：不用 vxe 的 `pager-config`（依赖未安装的 `vxe-pc-ui` 中的 `VxePager`），用 Arco `a-pagination` 封装为 `DataGridPager`，样式取自现 `PaginatedDataTable`（`.grid-pagination`）。

**Traces 的分页器位置**：已决定统一到底部（与 SQL 结果一致），`TraceTable` 删除标题栏的 `a-pagination`；标题栏的 "showing x-y" 通过 `v-model:page` / `v-model:page-size` 读取。

**服务端分页**：目前没有消费方需要。API 预留 `total` + `@page-change` 即可扩展，不在本次实现。

### 5.8 高度契约

- 面板内滚动：父链 `flex: 1; min-height: 0`（`gpt-table-panel` 已满足）。分页器在 `DataGrid` 内部以 flex 列布局排在表格下方（替代 `PaginatedDataTable` 的外层 flex）。
- 页面滚动（flow）：不传高度，通过 `gpt-table-page` class 推导 `pageScroll`。

### 5.9 单元格与表头渲染：内置 vs 插槽

**划分原则**：由**列元数据**（`data_type` / `semantic_type` / `tsColumn` / `linkColumn` / `columnMode`）决定的渲染，`DataGrid` 内置；由**页面业务**决定的渲染，走插槽。前者如果不内置，每个消费方都要重复实现，正是现在两套表格分裂的原因；后者内置会让通用组件知道业务。

**内置（`renderers/`）**

| 渲染器      | 触发条件                    | 内容                                                                  | 现状                                          |
| ----------- | --------------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| 时间表头    | 时间类型列                  | 图标 + 列名 + 时区标签，点击切换格式化/原始值，时区 tooltip           | ✅ 已有（`useLogsTimeFormat.renderTsHeader`） |
| JSON 表头   | `isJsonDataType(data_type)` | 语义 pill + 下拉菜单（hideNulls 开关）                                | ❌ 从 DataTable 移植                          |
| 语义表头    | 有 `semantic_type`          | `gpt-semantic-th` pill（tag / field / timestamp 配色）                | ❌ 从 DataTable 移植                          |
| 普通表头    | 其余                        | 纯文本                                                                | ✅                                            |
| 时间单元格  | 时间类型列                  | 格式化值；`tsCellDetail` 时主时间列为详情链接                         | ✅ 已有                                       |
| JSON 单元格 | JSON 列                     | 单行紧凑显示（受 hideNulls 影响），详情 popover 中 pretty print       | ❌ 从 DataTable 移植                          |
| 链接单元格  | `linkColumn`                | 链接按钮，emit `columnLinkClick`                                      | ✅ 已有                                       |
| 合并单元格  | `columnMode !== 'separate'` | `key: value` 串联                                                     | ✅ 已有                                       |
| 普通单元格  | 其余                        | 文本 + 省略号                                                         | ✅ 已有                                       |
| 单元格操作  | `showContextMenu`           | 悬停 `⋮` → 复制 / 过滤（操作符按列类型）；`enableCellCopy` 并入此菜单 | ✅ 已有（JSON 判定统一改用 `isJsonDataType`） |
| 截断查看    | 非时间、非链接列            | 单元格点击 → 共享详情 popover                                         | ✅ 已有                                       |

**插槽（只保留实际在用的）**：全仓只有 5 个 `column-*` 插槽、0 个 `title-*` 插槽。

| 插槽                                 | 消费方       | 用到的插槽参数                                 |
| ------------------------------------ | ------------ | ---------------------------------------------- |
| `#column-trace_id`                   | `TraceTable` | `record` `showContextMenu` `handleContextMenu` |
| `#column-series` / `#column-values`  | `metrics`    | `record`                                       |
| `#column-status` / `#column-operate` | `flow`       | `record`                                       |

插槽契约沿用 DataTable 的命名，消费方模板基本不用改：

```ts
// DataGrid 内：有同名插槽则覆盖内置单元格渲染器
slots: {
  default: (params) =>
    h('div', { class: 'dg-cell-inner' }, [
      $slots[`column-${field}`]!({
        record: getOriginalRow(params.row), // 原始行，不是展示行
        rowIndex: params.row.__rowIndex,    // 全量下标
        column: meta,
        renderedValue: textOf(params.row[field], meta),
        showContextMenu: showFilterMenu.value,
        handleContextMenu: (record, field, event) => contextMenu.openContextMenu(record, field, event),
      }),
    ]),
}
```

- **优先级**：消费方插槽 > 内置渲染器（按上表触发条件）> 普通文本。
- **`title-*` 插槽不提供**：没有消费方在用，需要时再加，机制与 `column-*` 相同。

**内置渲染器的实现约束**

1. **用 `h()` 渲染函数，不用每格一个组件**：虚拟滚动时单元格频繁创建销毁。DataTable 现在给每个时间单元格包一层 `a-tooltip`、每个可展开单元格包一层 `a-popover`，统一后改为表头 tooltip + 一个共享详情 popover（`LogsVxeTable` 已是这个模式）。
2. **统一 DOM 结构**：所有单元格（包括插槽输出）都包在 `.dg-cell-inner` 里，文本放在 `.dg-cell-text`，这样 §3.1 的测量期 CSS 对内置渲染器和插槽都生效。插槽内容不要设 `width: 100%`，否则测量会失效（写进组件注释和 V1 验证）。
3. **表头里的交互元素**（JSON 下拉、时间切换）：弹层挂到 `body`，避免被表头容器裁切；点击不能触发列拖拽或排序。
4. **状态集中在 `DataGrid`**：时间格式开关、每列的 hideNulls 是表级状态，渲染器只读，切换后不触发列宽重测（宽度按格式化后的值测量）。

---

## 6. 提升

### 6.1 可维护性

| 项                             | 现状                                                                                                                                  | 统一后                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 表格引擎                       | 2 套（Arco `a-table` + vxe）                                                                                                          | 1 套                                                                    |
| 表格组件代码                   | DataTable 2070 行 + PaginatedDataTable 180 行 + LogsVxeTable 1851 行                                                                  | DataGrid 约 2000 行（多数为 LogsVxeTable 现有代码）                     |
| 列宽算法                       | 3 套：DataTable 普通（两阶段测量 + `fitColumnWidths`）、DataTable 虚拟（字符估算，死代码）、LogsVxeTable（字符估算 + 最宽列吸收）     | 非虚拟 0 行测量代码（vxe 自动）；虚拟一个冻结函数；共用约 15 行溢出判定 |
| 列宽相关状态机                 | `widthsLocked` / 50ms 定时器 / `tableRenderKey` / `virtualRemountEpoch` / `virtualResizePending` + `pointerup` 监听 / 裁切提示        | 无重挂、无定时器；只有 `capped` 和（虚拟时）`frozen`                    |
| 分页                           | 2 份客户端分页实现，行为不一致                                                                                                        | 1 份 `use-pagination` + 1 个分页器                                      |
| 时间格式、右键菜单、单元格详情 | 各两份实现，已出现行为差异（例如判定 JSON 列：DataTable 用 `isJsonDataType`，日志表只认 `data_type === 'json'`；`=~` 只有日志表支持） | 各一份                                                                  |
| 主题覆盖                       | `:deep(.arco-table-*)` 约百条 + `--vxe-ui-*` 变量两套                                                                                 | 只剩 vxe 变量映射一套                                                   |
| 新增表格能力的成本             | 做两遍                                                                                                                                | 做一遍                                                                  |

### 6.2 实际使用表现

| 场景                                  | 现状                                                                                | 统一后                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| 日志表列宽准确度                      | 按 `8px/字符` 估算：中文、emoji 偏窄被截断，窄字符偏宽浪费空间；时间列写死 200px    | 浏览器真实测量                                      |
| 日志表宽度策略                        | 估算宽度恒定封顶 600；最宽列吸收剩余                                                | 与 SQL 结果同一规则：不溢出不封顶并铺满，溢出才封顶 |
| 两类表的观感                          | 行高、表头、hover、截断交互、右键菜单各自一套                                       | 一致                                                |
| 不分页的大结果集（metrics、指标结果） | 全量渲染，上千序列时首屏与滚动明显卡顿                                              | 超阈值自动虚拟滚动                                  |
| 分页体验                              | SQL 结果与 Traces 的分页器位置、选项、跨页定位能力不同                              | 一致；Traces 也获得"详情抽屉跨页定位"和"翻页回顶部" |
| 窗口缩放 / 侧栏开合                   | DataTable `useElementSize` 重跑 fit；LogsVxeTable 触发 `recalculate(true)` 全量重测 | vxe `autoResize` 内建处理                           |
| 超宽表横向滚动                        | 均可滚                                                                              | 均可滚，表头与内容体列宽同源                        |

---

## 7. 不足与可能的问题

### 7.1 确定的代价

| 项                       | 说明                                                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **包体积**               | vxe chunk 现在只在日志页按需加载：JS 556KB / gzip 174KB，CSS 147KB / gzip 23KB（`dist/assets/LogsVxeTable-*`）。统一后 SQL 结果页（Table Query 首页）、Traces、Flow 也要加载。Arco `a-table` 仍被 [`explain-grid.vue`](../src/views/dashboard/modules/explain/explain-grid.vue) 使用，Arco 侧**不会**减重 |
| **分页表翻页时列宽会变** | DataTable 现在只在第一页测一次，翻页沿用；vxe 每页按当页内容重排，长短不一的页之间列宽会跳。这是"不自己测量"的直接代价。用户拖拽过的列不受影响                                                                                                                                                            |
| **拖拽列宽手感变化**     | Arco 普通表拖拽时实时变化；vxe 是"参考线 + 松手生效"                                                                                                                                                                                                                                                      |
| **溢出判定多一次重排**   | 溢出的结果集 / 页会排两次（先自然宽、再封顶）。分页 20 行成本很低，但若可见，会表现为一次列宽收缩                                                                                                                                                                                                         |
| **DOM 不再是单张表**     | 表头与内容体是两个 `<table>`：跨表头/内容体的文本选择、整表复制粘贴到表格软件的效果不如单表；屏幕阅读器无法把单元格关联到表头                                                                                                                                                                             |
| **虚拟模式下浏览器查找** | Ctrl+F 搜不到未渲染的行（日志主表现状已如此；新增影响的是超阈值的指标表）                                                                                                                                                                                                                                 |
| **依赖 vxe 的程度加深**  | vxe 有过拆包破坏性变更（4.7 把 Loading 等拆到 `vxe-pc-ui`，本仓的 `#loading` 插槽就是为此打的补丁）；类型依赖未安装的 `vxe-pc-ui`                                                                                                                                                                         |
| **剩余空间分配语义微调** | `proportional` 变为平分；"封顶后有富余"时富余给吸收列而非还给被封顶的列（§3.2）                                                                                                                                                                                                                           |

### 7.2 实现风险（需验证）

| #   | 风险                                                                                                  | 验证 / 退路                                                                      |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| V1  | `[data-calc-col]` 样式后，auto 列宽是否等于内容自然宽（含语义表头 pill、`⋮` 图标、链接列）            | 在 `label-value-panel` 上先验；测量期隐藏 `⋮`，表头 pill 加 `width: max-content` |
| V2  | 溢出判定的两次重排是否可见（闪一下）                                                                  | 判定期给表格 `visibility: hidden`；或缓存"该列集合上次是否封顶"作为初值          |
| V3  | 虚拟首屏（约 30 行）的代表性不如现有 100 行采样，后面更长的内容会被截断                               | 截断单元格点击看详情；必要时测量期临时多渲染前 N 行                              |
| V4  | 判定溢出要读容器宽度，需取 vxe 内部 DOM（`.vxe-table--body-wrapper.body--wrapper` 的 `clientWidth`）  | 封装成一个函数，升级 vxe 时只改一处                                              |
| V5  | `height="100%"` + `autoResize` 能否覆盖 tab 切换、抽屉开合、隐藏后再显示                              | 保留一个 `ResizeObserver → recalculate()` 兜底                                   |
| V6  | 插槽内容（trace_id 链接 + 下拉、flow 状态 pill / 操作按钮、metrics series）在测量期能否得到正确自然宽 | 插槽统一包 `.dg-cell-inner`；个别插槽在测量期 CSS 中单独放开                     |
| V7  | 虚拟 + 换行时行高估计偏差导致滚动条跳动                                                               | 维持 `recalcRowHeight` 采样                                                      |
| V8  | 横向滚动恢复后超宽表（60 列）暴露新问题                                                               | 实验室加 60 列 case                                                              |

---

## 8. 落地方式

**一次完成**（已按此执行）：先在 `DataGrid` 落地列宽测量 / 溢出封顶 / 虚拟冻结，再补分页与内置渲染，最后一次性迁移全部消费方并删除 `DataTable` / `PaginatedDataTable`。

人工回归清单（开发服务器逐页看）：

1. Logs Query 主表：列宽是否贴近内容；换行；load-more；虚拟滚动不越滚越宽
2. Drilldown 日志预览（`:virtual="false"`）：测量期 CSS / 溢出封顶
3. Table Query SQL 结果：分页、语义表头、JSON 列、时间切换、详情抽屉跨页
4. Traces：底部分页、trace_id 链接插槽、"showing x-y"
5. Flow：页面滚动（`fill-height=false`）、`proportional` 铺满、status/operate 插槽
6. Pipeline 预览、Metrics、Drilldown 指标结果

---

## 9. 与 `table-engine-evaluation.md` 的差异

| 主题                         | 原文档                                                     | 本文（源码核实）                                                                       |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 非虚拟列宽                   | "全列标 `auto` 即可"                                       | 方向正确；需 `[data-calc-col]` 修复插槽 CSS，并用列配置 + 溢出封顶判定还原原有宽度策略 |
| `fitColumnWidths` / 分配策略 | 需移植 600 软上限、`proportional` 需自定义                 | 不移植；用 vxe 列配置表达，`proportional` 变平分                                       |
| 虚拟列宽                     | 全列 auto 会只增不减                                       | 确认，触发点是**每次纵向滚动**；方案是首屏测量后冻结                                   |
| 拖拽列宽                     | "mousemove 过程中就 recalculate，实时生效"                 | 拖动中只移参考线，**松手才生效**                                                       |
| 剩余空间分配                 | "余数从最后一列倒着补 ≈ last-column"                       | 主体是在可吸收列间**平分**，倒着补的只是零头                                           |
| 分页                         | 视为外部能力（`PaginatedDataTable` / `TraceTable` header） | 并入 `DataGrid`，两份实现合一；分页永远非虚拟                                          |
| 300px 兜底                   | 视为通用高度契约风险                                       | 只在开启纵向虚拟时出现                                                                 |
| 容器 resize                  | 需要 `recalculate()`                                       | `autoResize` 默认开启                                                                  |
| `enable-cell-expand` 死 prop | 仅 query-results-panel                                     | metrics 也在传                                                                         |
| 包体积                       | 未提及                                                     | SQL 结果页新增约 200KB（gzip）加载                                                     |
| 时间列时区 tooltip           | 列为日志表缺失能力                                         | 已有（`useLogsTimeFormat.renderTsHeader`）                                             |

---

## 10. 决策记录

| 决策              | 结论                                                   |
| ----------------- | ------------------------------------------------------ |
| 翻页列宽          | ✅ 首屏测量后冻结为 px；翻页不再重测（宽表性能）        |
| Traces 分页器位置 | ✅ 统一到底部                                          |
| 单元格 / 表头渲染 | 元数据驱动的内置，业务驱动的走 `column-*` 插槽（§5.9） |

| 拖拽列宽手感 | ✅ 接受 vxe 的"参考线 + 松手生效" |
| 包体积 | ✅ 接受 SQL 结果页加载 vxe（`defineAsyncComponent` 按需） |
