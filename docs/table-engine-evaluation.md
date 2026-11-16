# DataTable → vxe 可行性评估（渲染特性向）

> 问题：`DataTable`（Arco `a-table`）能否被 `LogsVxeTable`（`vxe-table`）替代，从而只留一套表格引擎？
> 结论摘要：**能统一，但目标不是"LogsVxeTable 替代 DataTable"，而是"新建一个基于 vxe 的 DataGrid，继承 DataTable 的 props 契约"。** 直接替换会丢掉 4 项渲染能力。
>
> 反向统一（vxe → Arco）**不可行**，有两条独立的硬约束：① Arco 虚拟列表只支持固定行高；② 虚拟模式下表头与内容体是两个表格、宽度靠"表头 `offsetWidth` 快照 → 内容体内联 px"同步，导致拖动列宽不同步、超宽时表头与内容体累积错位。本仓库为此写了四套 workaround（§2.6），**日志表当初迁到 vxe 就是这件事的第一次实践**。

---

## 1. 先看"到底有多少能力在被使用"

这是判断可行性的第一步，结果比预期乐观。

| 消费者 | 传入的 DataTable props | 透传给 `a-table` 的属性 | 自定义列插槽 |
| --- | --- | --- | --- |
| [`TraceTable.vue`](../src/views/dashboard/traces/components/TraceTable.vue#L42) | data / columns / loading / column-mode / displayed-columns / ts-column / class | — | `#column-trace_id` |
| [`metrics/index.vue`](../src/views/dashboard/metrics/index.vue#L60) | data / columns / loading / show-context-menu | `pagination` / `bordered` / `show-header` | `#column-series` `#column-values` |
| [`flow/index.vue`](../src/views/dashboard/flow/index.vue#L56) | leftover-strategy=proportional / data / columns / loading / show-context-menu | `scroll`（实为 `{y: undefined}`，空操作） | `#column-status` `#column-operate` |
| [`PipeFileView.vue`](../src/views/dashboard/logs/pipelines/PipeFileView.vue#L113) | data / columns / loading / show-context-menu / wrap-line | — | — |
| [`query-results-panel.vue`](../src/views/dashboard/drilldown/metrics/query-results-panel.vue#L6) | data / columns / loading / show-context-menu | `enable-cell-expand`（**组件未声明，已失效**）/ `pagination` / `bordered` / `show-header` | — |
| [`data-view/index.vue`](../src/views/dashboard/modules/data-view/index.vue#L105) → `QueryResultTable` | + result-key / displayed-columns / ts-column / wrap-line / size | `column-resizable` | — |
| [`code-editor.vue`](../src/components/markdown-render/components/code-editor.vue#L47) → `PaginatedDataTable` | displayed-columns / ts-column / show-context-menu | — | — |

两个关键事实：

1. **自定义列插槽只有 5 个**（分布在 4 个文件）。消费方 API 面很小。
2. **没有任何消费者传 `virtual-list-props`**（全仓 `.vue` 里只有 `a-select` / `a-tree` 用它，见 `table-select` / `metric-sidebar` / `table-manager` / `sql-builder`）。因此 [`DataTable`](../src/components/data-table/index.vue#L259) 的整条虚拟列表路径——`hasVirtualListProps` 分支、`buildVirtualListColumnWidths`、虚拟列宽 resize、`virtualColumnsClipped` 裁切提示、[277-305 行](../src/components/data-table/index.vue#L277)那段"Arco 虚拟列表只支持固定行高"的长注释所描述的场景——**在生产中全部不可达**。仅该路径的符号引用就有 43 处。

也就是说：DataTable 最复杂的半部分，是为一个**已经被放弃**的模式写的。

这不是"碰巧没人用"。日志表格之所以长成 `LogsVxeTable` 这个样子，正是因为 Arco 的虚拟列表跑不通 —— 下面的 §2.6 有源码级证据，以及本仓库为绕过它留下的四套 workaround。**从 Arco 虚拟列表迁到 vxe 这件事，其实已经发生过一次了；现在只是把它做完。**

---

## 2. 渲染特性矩阵

### 2.1 布局与滚动

| 渲染特性 | `DataTable` | `LogsVxeTable`（vxe 4.21） | 差异性质 |
| --- | --- | --- | --- |
| 高度模型 | CSS `height:100%`，容器滚动 + 自定义 sticky th | 必须测父容器像素（`useElementSize` → `gridHeight`），无值时回落 `100%` | ⚠️ **契约变化**，见 §4 |
| 变高行（换行） | 普通模式可用；虚拟模式下**不支持**（注释明确说需换掉 Arco 虚拟列表） | ✅ `show-overflow=false` + `recalcRowHeight` 按行重算 | ✅ vxe 更强 |
| 虚拟滚动 | Arco `virtual-list-props`（固定行高）→ **无人使用** | `virtual-y` / `virtual-x`，`gt:0` 即启用 | ✅ vxe 更强 |
| 横向滚动 | 非虚拟：容器 `overflow`；虚拟模式 `overflow-x:hidden` 裁切 | `virtual-x` 按列滚动 | ✅ vxe 更强 |
| 表头 | 自定义 sticky th + 语义渲染 | vxe 内建 sticky + `slots.header` | 平 |
| 空态 | `a-empty` + 自定义图标 | `#empty` 插槽（纯文本） | ⚠️ 图标需补 |
| loading | `a-spin dot` | `#loading` 插槽 | 平 |
| 行高 | CSS 驱动（`nowrap` + td padding 决定） | `rowConfig.height` 显式 px（mini 28 / small 32 / …） | ⚠️ 需按契约对齐 |

### 2.2 列宽（最大的实质差异）

| 渲染特性 | `DataTable` | vxe | 差异性质 |
| --- | --- | --- | --- |
| 自然宽度来源 | **两阶段真实测量**：先 `.natural-column-widths`（`max-content`）渲染，读表头 + 30 行 body 的 `scrollWidth`，再切 `table-layout:fixed` 锁定 | 只有 `width:'auto'` / `minWidth:'auto'` 的列才测（vxe 内部 `calcColumnAutoWidth`，同样读 `scrollWidth`）；**其余列走字符数估算** | ❌ **默认行为不同** |
| 估算公式 | `8px/字符 + 32px padding`，cap 600（[`data-table:456`](../src/components/data-table/index.vue#L456)） | 与 DataTable 虚拟模式同一套（[`column-widths.ts:18-19`](../src/components/logs-vxe-table/utils/column-widths.ts#L18)） | 平（本来就是对标的） |
| 软上限 | 600 | 600 | 平 |
| 剩余空间分配 | ① 先按"亏损比例"补给仍低于自然宽的列 ② 再按 `leftoverStrategy`：`last-column`（默认）/ `proportional` | vxe 自身分配（`autoList` / `remainList` / `fit`） | ❌ `proportional` 无对应 |
| 用户拖拽 | `column-resizable` → 更新该列 natural → 重跑 fit | `columnConfig.resizable` → `resizeWidth` | 平 |
| 容器 resize | `useElementSize` → 重算 | `recalculate()` | 平 |

**这一项是替换的主要工作量**：DataTable 默认"像素级测量"，vxe 默认"字符估算"。想让 8 个页面的表格看起来不变，必须把测量 + 拟合算法搬过去，或者全列标 `auto` 并接受 vxe 的分配策略。

### 2.3 单元格渲染

| 渲染特性 | `DataTable` | `LogsVxeTable` | 差异性质 |
| --- | --- | --- | --- |
| JSON 列 | pretty print + `hideNulls` 开关 + **表头下拉菜单**（[`data-table:57-74`](../src/components/data-table/index.vue#L57)） | 无，`JSON.stringify` 一把梭 | ❌ **能力缺失** |
| 语义表头 | ✅ `gpt-semantic-th`：主键 / 字段 / tag / 时间戳 的图标 + 配色（`getSemanticThClass`） | ❌ 无（普通 title 字符串） | ❌ **能力缺失** |
| 时间列 | 表头点击切换格式化/原始值 + 时区 tooltip + 图标 | ✅ 表头点击切换（`useLogsTimeFormat`），无时区 tooltip | ⚠️ 部分缺失 |
| 合并列 | `separate` / `merged` / `merged-with-keys`，按 `Merged_Column` 渲染 | ✅ 同三态，按 `__merged_parts` 渲染 | 平 |
| 裁切展开 | ✅ **列级**：测量自然宽 > 拟合宽 → 该列所有单元格带 popover | ⚠️ **单元格级**：点击 → 详情 popover | ❌ 交互模型不同 |
| 行尾操作图标 | ❌ 靠右键 | ✅ 行尾 `⋮` + `a-dropdown` | ✅ vxe 更强 |
| 右键上下文菜单 | ✅（含 copy + filter） | ✅（含 copy + filter，且过滤项按列类型） | ✅ vxe 更正确 |
| 链接列 | ❌ | ✅ `linkColumn` + `columnLinkClick` | ✅ vxe 更强 |
| 活动行高亮 | ✅ `activeRowKey` | ✅ `activeRowKey` | 平 |

### 2.4 数据流

| 渲染特性 | `DataTable` | `LogsVxeTable` |
| --- | --- | --- |
| 追加加载（load-more） | ❌ 无 | ✅ `hasMore` + `reachEnd` + 视口未满自动补 |
| 分页 | 外部（`PaginatedDataTable` footer / `TraceTable` header） | 无（设计上走 load-more） |
| 列被裁切提示 | ✅ `virtualColumnsClipped` | ❌ |

### 2.5 工程与依赖

| 项 | `DataTable` | `LogsVxeTable` |
| --- | --- | --- |
| 代码量 | 2070 行（单文件） | 1851 行（12 个文件，含 4 个 composable） |
| 依赖 | Arco（主 UI 库，已在） | `vxe-table@4.21.10` + `@vxe-ui/core@4.4.22`（已在），**MIT** |
| 类型健康度 | ✅ | ⚠️ [`types/all.d.ts`](../node_modules/vxe-table/types/all.d.ts#L2) 从**未安装**的 `vxe-pc-ui` 取类型 → vxe 组件无类型可用 |
| 现有测试 | 0 | 2 个 util 测试 |

### 2.6 Arco 虚拟列表的缺陷（源码 + 本仓 workaround 双重证据）

先说症状（与实际使用一致）：**表头和内容体是两个独立的表格；拖动列宽时内容体不跟随；表格超出容器宽度时表头与内容体对不齐。**

#### 源码层面：宽度是靠"值拷贝"同步的

Arco 在虚拟列表模式下会把表格拆成两个 `<table>`：

1. [`table.js:296`](../node_modules/@arco-design/web-vue/es/table/table.js#L296)
   ```js
   const splitTable = computed(() => isScroll.y || props.stickyHeader || isVirtualList.value || ...)
   ```
   `isVirtualList` 为真 → 表头与内容体分离渲染。

2. [`table.js:901-908`](../node_modules/@arco-design/web-vue/es/table/table.js#L901) —— 表头列宽被**快照**下来：
   ```js
   const getThWidth = () => { for (const key of Object.keys(thRefs.value)) width[key] = thRefs.value[key].offsetWidth; thWidth.value = width }
   ```

3. [`table.js:980-987`](../node_modules/@arco-design/web-vue/es/table/table.js#L980) + [`1018`](../node_modules/@arco-design/web-vue/es/table/table.js#L1018) / `1189` —— 内容体每个 `<td>` 直接吃这份快照当内联宽度：
   ```js
   const getVirtualColumnStyle = (name) => isVirtualList ? { width: `${thWidth.value[name]}px` } : undefined
   // → createVNode(Td, { style: style2, ... })
   ```
   而虚拟模式的表格**没有 `<colgroup>`**（`ColGroup` 只在非虚拟分支渲染）。所以内容体的列宽不是"布局算出来的"，是"从表头抄来的像素值"。

4. [`table.js:737-744`](../node_modules/@arco-design/web-vue/es/table/table.js#L737) —— 横向滚动靠打补丁：
   ```js
   const onTbodyScroll = (e) => { ... if (theadRef.value) theadRef.value.scrollLeft = scrollLeft }
   ```

**这三条组合起来就是症状的全部来源**：快照只在 `handleTbodyResize` 时刷新 → 拖动列宽时表头变了、快照没变 → 内容体不动；快照的像素值来自表头所在容器的可用宽度，而内容体容器因 `scrollbar-gutter` 更窄 → 超出宽度后逐列累积偏移，越往右越不准。

#### 本仓代码层面：四套 workaround

| 症状 | 仓库里的对策 | 位置 |
| --- | --- | --- |
| 拖动时内容体不跟随 | **放弃实时预览**，松手后整表重挂 | [`data-table:1106-1117`](../src/components/data-table/index.vue#L1106)：*"Arco only updates the header during drag. Record the latest width and remount on pointerup so body columns catch up."* |
| 后续 `:width` 更新被忽略 | 宽度必须在挂载**前**算好 | [`data-table:570-571`](../src/components/data-table/index.vue#L570)：*"Arco virtual-list ignores later :width updates"* |
| 列变化后表头/内容体错位 | 列集合变化 → 重挂 | [`data-table:625-627`](../src/components/data-table/index.vue#L625)：*"can misalign header/body when columns change without remount"* |
| 超宽时横向错位 | **彻底禁用横向滚动**，超出的列裁切 + 提示 | [`data-table:1948-1949`](../src/components/data-table/index.vue#L1948)：*"Horizontal scroll would misalign sticky header vs virtual body"* → `overflow-x: hidden` |
| 幻影横向滚动条 | 关闭 `scrollbar-gutter` / 用外部宽度近似内部可用宽度 | [`data-table:365-372`](../src/components/data-table/index.vue#L365)：*"an inherent limitation of Arco's fixed-height virtual list"* |

配套的还有：`tableRenderKey` 重挂、`virtualRemountEpoch`、`virtualResizePending` + `pointerup` 监听、`virtualColumnClippedHintVisible` 裁切提示。**这些机制每一个都在补引擎的坑，不是在实现业务需求。**

#### 对照：vxe 为什么不会出同类问题

vxe 同样把 header / body / footer 分成三个容器，但它们各自渲染的 `<colgroup>`（[`header.js:450`](../node_modules/vxe-table/es/table/src/header.js#L450)、[`body.js:809`](../node_modules/vxe-table/es/table/src/body.js#L809)、[`footer.js:301`](../node_modules/vxe-table/es/table/src/footer.js#L301)）**都从同一个 column store 派生**：

```js
// table.js:4628  列宽变化时
const handleUpdateColResize = () => { analyColumnWidth(); recalculate().then(...) }
```

- 列宽的唯一真相是 `column.renderWidth`，三个 colgroup 都从它渲染 → **结构上不可能累积错位**，不存在"抄像素"的时序问题。
- resize 在 mousemove 过程中就 `analyColumnWidth + recalculate` → **实时生效，不需要重挂**。
- 横向滚动仍然是 `scrollLeft` 同步（[`table.js:12976+`](../node_modules/vxe-table/es/table/src/table.js#L12976)），但宽度来源单一，最坏只有 1 帧延迟，不会有累积偏移。

所以这不是"换一个库调调配置"，而是**从"值拷贝同步"换成"单一数据源派生"**。

### 2.7 列宽到底在算哪一步（三阶段，别混为一谈）

上一版矩阵把"自然宽度来源"写在一行里，容易误读成"两边都在按字符数硬算"。实际是**三个阶段**，两个实现都有 native 测量，差别在默认策略：

| 阶段 | 做什么 | DataTable 普通表 | DataTable 虚拟（死路径） | LogsVxeTable 现状 | vxe 能力 |
| --- | --- | --- | --- | --- | --- |
| **① 求自然宽度** | 拿到"这列内容本来要多宽" | ✅ **浏览器 native auto**：加 `.natural-column-widths` 让 `table-layout:auto` + `width:max-content`，再由 JS 读表头 + 最多 30 行 body 的 `scrollWidth`（[`data-table:769-830`](../src/components/data-table/index.vue#L769)） | ❌ 字符估算 | ❌ 字符估算 | ✅ `width:'auto'` → `calcColumnAutoWidth` 读 `scrollWidth`（[`table.js:1796`](../node_modules/vxe-table/es/table/src/table.js#L1796)） |
| **② 分配容器宽度** | 总和 < 容器 → 怎么摊；> 容器 → 横向滚动 | ✅ `fitColumnWidths`：软上限 600 → 补给被截断的列 → 余数按 `leftoverStrategy`（[`data-table:836`](../src/components/data-table/index.vue#L836)） | 最宽列吸收 | 最宽列吸收（`minWidth:'auto'`） | ✅ `autoCellWidth`：按列宽类别分配，余数**从最后一列倒着 +1px**（[`table.js:1854`](../node_modules/vxe-table/es/table/src/table.js#L1854)） |
| **③ 锁成 fixed** | 后续渲染用显式 px | ✅ 切 `.widths-locked`：`table-layout:fixed` + 每列 `:width` | ✅ 挂载前算好 | ✅ 一直是显式 px | ✅ `<colgroup>` 从 column store 派生 |

所以：**"按字符数算"只出现在②之前的估算兜底里，不是唯一的宽度来源。**

#### 为什么需要"② 分配"这一步，而不能交给浏览器？

因为一旦用 `table-layout: fixed`，浏览器就不再按内容分配了 —— 它只会把你的宽度**照抄**，没给宽度就均分（所有列一样宽，数据列长短悬殊时直接不可用）。而**必须用 fixed** 的场景只有这几个：

1. **虚拟滚动**：行绝对定位，列宽必须渲染前已知（DataTable 注释 *"Column widths must be known BEFORE render"*）；
2. **表头与内容体分离**（sticky header / 虚拟）：两处必须共享同一套确定列宽，否则就是 §2.6 那种错位；
3. **列宽可拖拽并持久**：拖完就是 px，不能回落 auto；
4. **数据刷新时列宽稳定**：`auto` 会随每次查询结果重排，仪表盘反复查询时列宽乱跳，非常刺眼；
5. **截断必须在列粒度生效**：`auto` 会倾向于给长内容更多空间，短列被压扁；`fixed` + `ellipsis` 才是可控的。

不需要这些时，直接用 `auto` 交给浏览器最省事。DataTable 在**空表**时正是这么做的：不锁宽度、保持 `width:100%` 以居中空态（[`data-table:414-416`](../src/components/data-table/index.vue#L414)、[`921-928`](../src/components/data-table/index.vue#L921)）——因为对着被拉伸的 auto 表测量会得到虚高的"自然宽度"。

#### 那为什么两边都会出现字符估算？

不是 native 做不到，而是**虚拟滚动下测不到未渲染的行**。同一个物理约束，注释写得很明白：

- DataTable：[`data-table:296-303`](../src/components/data-table/index.vue#L296) *"Column widths must be known BEFORE render … the browser cannot measure natural widths of off-screen rows. So column widths are estimated from data (char-count heuristic)"*
- vxe：`calcColumnAutoWidth` 只遍历已渲染的 cell；虚拟模式下只有可见窗口那几行

而且 vxe 在虚拟模式下还会**只增不减**（`colRest.width = Math.max(colWidth, colRest.width)`）——意味着如果全列标 `auto`，列宽会随着滚动越滚越宽，视觉抖动。**这才是 LogsVxeTable 全面走字符估算的真正原因：它要的是"挂载时就稳定"，不是"测得准"。**

#### 对统一方案的影响（W1 范围缩小）

| 表类型 | 该用的策略 | 理由 |
| --- | --- | --- |
| **非虚拟**（8 个消费方全是：分页 20 行 / 小结果集） | **全列 `width:'auto'`，native 测量** | 所有行都在 DOM 里，一次测全；不需要字符估算 |
| **虚拟**（只有日志表） | **字符估算 + 单列 `minWidth:'auto'`** | 避免列宽随滚动增长 |

所以新 `DataGrid` 不是"选一种宽度算法"，而是**按 `virtual` 二选一**——这恰好是今天两边各自已有的做法。W1 的工作量因此从"移植测量算法"降级为：

1. 非虚拟路径全部改标 `auto`，删掉按字符估算的分支；
2. 校验 vxe 的 `autoCellWidth` 分配结果 vs DataTable 的 `fitColumnWidths`（尤其"余数从最后一列倒着补"≈ `last-column`，但"补给被截断的列"这一步 vxe 没有 → 600 软上限的还原逻辑要自己补）；
3. `proportional` 仍需自定义。

> 附带风险：vxe 的 `calcColumnAutoWidth` **没有采样上限**（遍历该列所有已渲染 cell），DataTable 是 30 行采样。分页 20 行的表无所谓，但 `query-results-panel` / `metrics` 这种不分页的表在几百行时会有一次强制布局抖动 —— 落地时要么限行数，要么在 `recalculate` 前给样本。

---

## 3. 为什么不是反向统一（vxe → Arco）

两条硬约束，任何一条单独成立就已经否决了这个方向：

**① 能力缺口：Arco 虚拟列表只支持固定行高。**
`virtual-list-props` 的 `fixedSize` / `estimatedSize` 都是全局单值。而日志表格的换行是已上线功能，需要**逐行变高 + 虚拟滚动**同时成立。[`data-table:301-305`](../src/components/data-table/index.vue#L301) 自己的注释给出了结论：要支持真正的变高日志行，得把虚拟列表换成 react-window `VariableSizeList` 那一类。那不叫"统一组件"，叫"重写渲染内核"。

**② 结构缺陷：虚拟模式下宽度是"值拷贝"同步的（§2.6）。**
表头 `offsetWidth` 快照 → 内容体 `<td>` 内联宽度；快照只在 tbody resize 时刷新。后果是**拖动列宽无实时预览（要整表重挂）**、**超宽时表头与内容体逐列累积错位（只能禁用横向滚动）**。这两条已经在生产里用四套 workaround 兜着了。

要让 Arco 这条路线可用，得同时改掉 Arco 虚拟列表的行高模型和宽度同步机制 —— 那是给上游提 PR 的规模，不是本项目的选项。

vxe 已经同时满足（`show-overflow=false` + `recalcRowHeight`；colgroup 从单一 column store 派生）。**所以统一方向只能是 vxe，而且"日志表当初为什么迁到 vxe"就是这件事的第一次实践。**

---

## 4. 必须补的 4 项（这就是全部工作量）

| # | 缺口 | 影响面 | 做法 |
| --- | --- | --- | --- |
| **W1** | 列宽：非虚拟走 native 测量、虚拟保留估算；并补齐 600 软上限 / `proportional` | 全部 8 个页面 | 非虚拟全列 `width:'auto'`（删掉字符估算分支）；校验 vxe `autoCellWidth` 与 `fitColumnWidths` 的差异（vxe 有"余数补最后一列"，**没有**"补给被截断列"）；`proportional` 需自定义。范围比原估小，见 §2.7 |
| **W2** | JSON 列 UX（pretty / hideNulls / 表头菜单） | SQL 查询结果、Pipelines、Traces | 自定义 `slots.header` + `slots.default`（vxe 已支持函数式 slot，`buildVxeColumns` 就在用） |
| **W3** | 语义表头（主键/字段/tag/时间戳 图标与配色） | SQL 查询结果、Traces | 同上，`slots.header` 里渲染 `gpt-semantic-th` |
| **W4** | 裁切展开（列级 popover）+ `virtualColumnsClipped` | SQL 查询结果 | ⚠️ 这两者本质是 §2.6 的 workaround 产物（因为不能横向滚动，只好裁切 + 提示）。vxe 下横向滚动可用了，**建议直接取消裁切提示，恢复横向滚动**；长文本改为"点击单元格看详情"，与日志表统一。这样 W4 从"补功能"变成"删功能"，省 0.5d |

另外两项**契约级**改动（不算功能，但会让 8 个页面都要看一眼）：

- **高度契约**：vxe 需要一个可测量的定高容器。DataTable 现在是"父容器多高我就多高"（CSS `height:100%`）。所有消费方的容器必须是有确定高度的 flex 子项，否则会塌成 300px（vxe 在无高度时给的兜底值）。
- **透传属性显式化**：`pagination` / `bordered` / `show-header` / `column-resizable` 这 4 个 Arco 属性要变成新组件的显式 props（`enable-cell-expand` 目前就是死 prop，直接删）。

---

## 5. 工作量与拆分

| 工作项 | 估时 | 依赖 |
| --- | --- | --- |
| W1 列宽：非虚拟改 native 测量 + 校验/补齐分配策略 | 1.5d | 阶段 0 实验室 `table-*` case 就位 |
| W2 JSON 列渲染 | 1d | — |
| W3 语义表头 + 时间列 tooltip | 0.5d | — |
| W4 裁切提示下线 + 恢复横向滚动 + 长文本改点击详情 | 0.5d | 需产品决策，但方向已明确（见 §4） |
| 统一组件骨架 `DataGrid` + props 契约 + 透传属性显式化 | 1d | W1–W4 |
| 迁移 8 个消费方 + 实验室 4 个 case 视觉对齐 | 1.5d | 骨架就绪 |
| 收尾：删 `DataTable` / `LogsVxeTable`，补 `vxe-pc-ui` 类型依赖 | 0.5d | — |
| **合计** | **~6.5 人日** | 可拆 4 个 PR |

对比参考：在"两套引擎共存"的路线上，阶段 2 的"抽公共渲染层"也要 2–3 人日，而且**引擎分裂会永久保留**（两套列宽、两套右键菜单、两套空态）。

**结论：多花 3–4 人日，换掉一个引擎，是划算的。** 顺带拿到三样东西：

1. 清掉 DataTable 虚拟路径这段 43 处符号引用、却无人可达的死代码；
2. 清掉四套 workaround（整表重挂 / 宽度预计算 / 禁用横向滚动 / 裁切提示）—— 它们不是业务需求，是补引擎的坑；
3. 恢复被 `overflow-x: hidden` 掩盖的横向滚动能力，超宽表格从"裁掉"变"可滚"。

---

## 6. 风险清单

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 列宽视觉变化（估算→测量，或测量策略不同） | **高** | 实验室 `table-engines` case 做改前/改后截图对比；先只统一到"测量"再谈样式微调 |
| 高度契约导致个别页面表格塌陷 / 撑破布局 | **高** | 逐页检查 8 个消费方的容器是否定高；vxe 无高度会兜底 300px，很容易被误认为"数据没渲染" |
| 变高行 + 虚拟滚动的行高跳动 | 中 | 沿用 `recalcRowHeight` 的 100 行采样；在大数据量下实测滚动锚定 |
| vxe 类型缺失（`vxe-pc-ui`） | 中 | 加 `vxe-pc-ui` 到 devDependencies 仅供类型；或短期 `declare module` 兜底 |
| 裁切展开的交互回退被用户感知 | 低 | Arco 现状是"超宽就裁掉、给个提示、点开看"，本来就不好用；vxe 下恢复横向滚动是**功能恢复**，不是回退 |
| **相反的风险：横向滚动恢复后暴露新的布局问题** | 中 | 原来被 `overflow-x:hidden` 掩盖的超宽场景会第一次真正可以滚动；需要在实验室加一个"60 列"的 case |
| 大数据量下 vxe 性能不达预期 | 低 | 已有日志表在跑；再做一档 5 万行的冒烟 |

---

## 7. 建议的落地顺序

1. **阶段 0 先做实验室的 3 个表格 case**（`table-engines` / `table-pagination` / `table-states`）—— 它们既是评估的继续，也是迁移期间的唯一回归手段。
2. **建 `DataGrid` 骨架（vxe）**，先只接一个低风险消费方（`PipeFileView`：无分页、无插槽、`wrap-line` 固定），验证高度契约。
3. **补 W1 列宽**，用 `table-engines` case 对齐；这是唯一会让"看起来不一样"的一步，必须单独一个 PR。
4. **补 W2/W3/W4**，迁移 SQL 查询结果（`data-view`）——它同时用到 JSON 列、语义表头、裁切展开，是功能最全的消费者，也是最强的验收对象。
5. 迁 `TraceTable`（有自定义列插槽）、`metrics`、`flow`（有 `proportional`）、`code-editor`。
6. 删两个旧组件，收 `vxe-pc-ui` 类型依赖。

---

## 8. 待你决策的两点

1. **裁切 / 展开（W4）**：只剩一个决策 —— 超宽表格是**恢复横向滚动**（vxe 下可行，等于把 §2.6 逼出来的 `overflow-x:hidden` + 裁切提示整块删掉），还是保留"裁切 + 提示"？我建议前者：后者是 workaround 的化石。长文本的查看方式统一成"点击单元格 → 详情 popover"（日志表已经是这样）。**这个决策不影响工作量，但影响 SQL 查询结果的交互。**
2. **`leftoverStrategy`**：`flow` 用了 `proportional`。统一后是保留这个 prop，还是把所有表统一成 `last-column`？保留的话 W1 要多做半天。

> 补充：如果后续想把它变成"技术债清理"叙事而不是"组件重构"，可直接引用 §2.6 —— 迁移的直接收益不是"少一个组件"，而是**删掉四套为绕过 Arco 缺陷而存在的代码**。
