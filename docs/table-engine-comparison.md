# Arco DataTable vs vxe DataGrid：实现与功能差异

> "Arco DataTable" 指改造前的 `src/components/data-table/index.vue`（基于 `@arco-design/web-vue` 的 `a-table`，2070 行，含自研列宽管线）。
> "vxe DataGrid" 指现在的 `src/components/data-grid/DataGrid.vue`（基于 `vxe-table` 4.21，1241 行）。
> 迁移过程与性能数据见 [data-grid-perf-review.md](./data-grid-perf-review.md)，特性/页面清单见 [data-grid-migration-summary.md](./data-grid-migration-summary.md)。

---

## 1. 一句话

**Arco 的表格把"宽度一致性"压在 JS 上（表头量完把像素抄给内容体），vxe 把"宽度一致性"压在同一个 column store 上（三块 DOM 都从它派生）。** 这一条差异决定了后面几乎所有的性能与稳定性结论。

---

## 2. 实现机制差异

### 2.1 DOM 结构：两套"表头 vs 内容体"的解法

```
Arco（虚拟/滚动模式）                      vxe
┌────────────────────┐                  ┌────────────────────┐
│ <table> 表头        │  ← 独立 <table>   │ header 容器        │
│  colgroup: 按列宽   │    无 colgroup    │  <colgroup> ←──┐   │
├────────────────────┤                  ├────────────────┤   │
│ <table> 内容体      │  ← 独立 <table>   │ body 容器      │   │
│  <td style="width:  │    每格内联宽度    │  <colgroup> ←──┼── 同一个
│      header量到的px"│    （值拷贝）      │  <td>          │   │  column store
└────────────────────┘                  └────────────────┘   │
        ↑ 宽度靠 getThWidth() 快照            ↑ 宽度靠 renderWidth 派生
```

| | Arco | vxe |
| --- | --- | --- |
| 何时拆分 | [`splitTable`](../node_modules/@arco-design/web-vue/es/table/table.js#L296) = `scroll.y \|\| stickyHeader \|\| virtualList \|\| …` | 始终分 header / body / footer 三个容器 |
| 列宽同步 | 表头 `offsetWidth` **快照** → 内容体 `<td>` 内联 px（[`getThWidth`](../node_modules/@arco-design/web-vue/es/table/table.js#L902)、[`getVirtualColumnStyle`](../node_modules/@arco-design/web-vue/es/table/table.js#L980)） | 三个容器各自 `<colgroup>`，值来自同一份 `column.renderWidth` |
| 失步后果 | 快照过期就错位；改宽度要重挂整表才能让内容体跟上 | 结构上不可能累积错位 |
| 横向同步 | [`onTbodyScroll`](../node_modules/@arco-design/web-vue/es/table/table.js#L737) 里 `thead.scrollLeft = tbody.scrollLeft` | 同样同步 `scrollLeft`，但宽度来源单一，只差 1 帧 |

**这就是为什么旧代码里有一堆 workaround**：整表重挂（`tableRenderKey`）、宽度必须挂载前算好、`overflow-x: hidden` 禁掉横向滚动、列被裁切时给提示。

#### 2.1.1 展开：为什么"值拷贝 vs 单一数据源"是根因

表格的列宽必须同时满足**两处**：表头单元格和内容体单元格。两处一旦不一致，就是"表头和内容对不齐"。

**Arco 有两种模式，差别很大：**

| 模式 | 表头与内容体 | 宽度来源 | 一致性 |
| --- | --- | --- | --- |
| 单表（不滚动、不 sticky、不虚拟） | 同一个 `<table>` | 同一个 `ColGroup` | ✅ 天然一致 |
| 拆分（sticky header / 纵向滚动 / 虚拟列表） | 两个独立 `<table>` | 表头走 `ColGroup`（响应式 `columnWidth`），内容体走 `thWidth` **快照** | ❌ 需要 JS 持续同步 |

拆分模式下，内容体是**没有 `<colgroup>` 的**。看虚拟列表分支：

```js
// table.js:1320 虚拟列表：listAttrs 是一个裸 <table>，没有 ColGroup vnode
createVNode(VirtualList, mergeProps({
  listAttrs: { class: `${prefixCls}-element`, style: contentStyle.value },
  ...
}), { item: ({ item, index }) => renderRecord(item, index) })

// table.js:1189 每个 <td> 的宽度来自快照
const style2 = getVirtualColumnStyle(column.dataIndex)   // { width: `${thWidth[name]}px` }

// table.js:902 快照怎么来的：直接读表头单元格的 offsetWidth
const getThWidth = () => {
  for (const key of Object.keys(thRefs.value)) width[key] = thRefs.value[key].offsetWidth
  thWidth.value = width
}

// table.js:916 只有内容体尺寸变化时才刷新快照
const handleTbodyResize = () => { ...; getThWidth() }
```

**关键点：宽度的"真相"存在 DOM 里（`offsetWidth`），所以它只能被"读出来再抄过去"。** 这决定了四件事：

1. **拖动列宽时内容体不跟随** —— 拖动只更新响应式的 `columnWidth`（表头生效），`thWidth` 快照没刷新。旧 `DataTable` 的对策是"松手后整表重挂"，代价是**拖动过程没有实时预览**。
2. **超宽时逐列累积错位** —— 快照来自表头容器的可用宽度，内容体容器因为有 `scrollbar-gutter` 更窄，两者每列差一点，往右越差越多。对策是 `overflow-x: hidden`：**干脆不让横向滚动**。
3. **列集合变化后错位** —— `thRefs` 换了一批 key，`thWidth` 还是旧的。对策是"列变化就重挂"。
4. **幻影横向滚动条** —— 宽度按外层容器算、却作用在更窄的内层区域上。

这四条不是"Arco 的 bug"，而是"宽度真相放在 DOM 里"的必然结果。而**拆分模式恰恰是数据表格最需要的模式**（sticky 表头 + 虚拟滚动），所以它绕不开。

**vxe 的模型：宽度是可序列化的数据，DOM 只是投影。**

```js
// table.js:1854 一次遍历，给每一列算出 renderWidth（像素）
const autoCellWidth = () => {
  // 按列宽类别分配：pxList / autoList / minWidth / 百分比 ……
  pxList.forEach((column) => { column.renderWidth = ... })
  autoList.forEach((column) => { column.renderWidth = ... })
  ...
}

// header.js:450 / body.js:809 / footer.js:301
// 三个容器各自渲染 <colgroup>，值全部来自 column.renderWidth
h('colgroup', { ... }, visibleColumn.map((column) => h('col', { width: column.renderWidth })))
```

三个容器**不是把像素互相抄，而是各自从同一个 `column.renderWidth` 渲染**。所以：

- 拖动列宽（[`handleUpdateColResize`](../node_modules/vxe-table/es/table/src/table.js#L4628)）→ `analyColumnWidth()` + `recalculate()` → 三个 colgroup 一起重算，**实时生效，不需要重挂**；
- 横向滚动的范围 = `sum(renderWidth) − clientWidth`，是**算出来的**而不是"摸出来的"——所以能精确断言"滚动范围等于列宽和减容器宽"；
- 列宽可以被冻结成 px 存进 store，之后的重排**不需要再读 DOM**——这才是能删掉测量管线的根本原因。

**诚实的边界**：vxe 同样把 header/body/footer 拆成三个容器，横向滚动也仍然靠 `scrollLeft` 同步（`table.js:12976+`）。差别只在**宽度来源**：单一数据源下最坏是 1 帧滚动延迟，不会累积成"越往右越偏"。

### 2.2 列宽：测量 vs 派生

| | Arco DataTable（我们自研的管线） | vxe DataGrid |
| --- | --- | --- |
| 自然宽度来源 | **DOM 测量**：先 `table-layout:auto` + `width:max-content` 渲染，读表头 + 30 行 body 的 `scrollWidth`，再锁 `fixed` | **字符估算**：从已字符串化的行取最长串，按字符类别（小写 0.52em / 数字大写 0.63em / CJK 1em）算 px |
| 复杂度 | O(列数 × 单元格数)（每列一次全表扫描 + 每格读 `scrollWidth`） | O(行 × 列) 字符串扫描，无 DOM 读取 |
| 剩余空间分配 | 软上限 600 → 亏损补偿 → `leftoverStrategy`（last-column / proportional） | 交给 vxe 的 [`autoCellWidth`](../node_modules/vxe-table/es/table/src/table.js#L1854)：按列类别分配，余数补最后一列 |
| 用户拖拽 | `column-resizable` 事件 | `resizable-config`；另有 `isDblclickAutoWidth`（双击边缘只测这一列） |
| 精度 | 像素级 | 估算（可显式 `ColumnType.width` 覆盖） |

> 当前 vxe DataGrid 只保留了"估算"这一条。Arco 那套测量方案的成本实测：232 列时单次测量 **2.7s**（一个长任务），移除后同场景 **287ms**。

### 2.3 虚拟化

| | Arco | vxe |
| --- | --- | --- |
| 行虚拟 | `virtual-list-props`，**固定行高**（`fixedSize`/`estimatedSize` 是全局单值） | `virtual-y-config` + `row-config.height` |
| 变高行 | ❌ 需要换掉虚拟列表实现（旧代码注释原话："react-window VariableSizeList 那一类"） | ✅ `show-overflow=false` + [`recalcRowHeight`](../node_modules/vxe-table/es/table/src/table.js#L6250) 按行测高 |
| 列虚拟 | ❌ 与横向滚动冲突（会加剧表头错位），旧代码直接 `overflow-x: hidden` | ✅ `virtual-x-config`，与行虚拟可同时开启 |
| 旧代码实际使用 | 无（8 个消费方都没传 `virtual-list-props`，整条路径是死代码） | 行虚拟按行数、列虚拟按列数的 `gt` 阈值自动决定 |

### 2.4 渲染与扩展方式

| | Arco | vxe |
| --- | --- | --- |
| 列定义 | `<a-table-column>` 组件树（模板里 `v-for` 生成） | `columns` 配置数组 + `slots.default` 函数式渲染器 |
| 单元格 | 作用域插槽 `#cell="{ record, rowIndex }"` | `slots.default = (params) => h(...)` |
| 尺寸 | `size` 枚举（mini/small/medium/large）→ Arco CSS 变量 | 同名 prop，但我们显式映射到字号/行高/padding，**不再依赖框架的尺寸表** |
| 主题 | less 变量 + Arco CSS 变量 | `--vxe-ui-*` CSS 变量（在 `.data-grid` 上覆盖） |

### 2.5 事件与交互

| | Arco | vxe |
| --- | --- | --- |
| 列宽拖拽 | `@column-resize` → 我们自己维护宽度表 | 内部 `resizeWidth`，由 `handleUpdateColResize` 触发重算 |
| 单元格点击 | 每个单元格自己的监听 | 表格级 `@cell-click` 再分派（时间列 / 链接列 / 展开详情） |
| 表头双击自适应 | ❌ | ✅ `isDblclickAutoWidth` |

### 2.6 数据流

| | Arco | vxe |
| --- | --- | --- |
| 分页 | 组件外（`PaginatedDataTable` footer / `TraceTable` 卡片头，两套） | 组件内 `usePagination` + `DataGridPager`（一套） |
| 追加加载 | ❌ | ✅ `hasMore` + `reachEnd` + 视口未满自动补 |
| 行标识 | `row-key="__rowIndex"` | 同，且虚拟滚动要求稳定 key |

---

## 3. 功能差异

| 功能 | Arco DataTable | vxe DataGrid | 性质 |
| --- | --- | --- | --- |
| 合并列（separate / merged / merged-with-keys） | ✅ | ✅ | 持平 |
| JSON 列：美化 + 隐藏 null + 表头菜单 | ✅ | ✅ | 持平 |
| 语义表头（主键 / tag / 字段图标） | ✅ | ✅ | 持平 |
| 时间列格式切换 + 时区提示 | ✅ | ✅ | 持平 |
| 右键过滤 + 复制 | ✅ 固定 8 个操作符（String 列也给 `>`、数值列也给 `LIKE`） | ✅ 按列类型（`filterOpsForType`） | **改进** |
| 行尾操作图标 | ❌（只能右键） | ✅ `⋮` | 改进 |
| 链接列 | ❌ | ✅ `linkColumn` | 改进 |
| 追加加载 | ❌ | ✅ | 改进 |
| 行虚拟 | ❌ 实际不可用（固定行高 + 表头失步） | ✅ 双向 + 变高行 | 改进 |
| 列虚拟 | ❌ 与横向滚动冲突 | ✅ | 改进 |
| 分页 | 外部两套实现 | 内建一套 | 统一 |
| 列宽可拖拽 | ✅ | ✅ + 双击自适应 | 改进 |
| 空态 / loading / 活动行 | ✅ | ✅ | 持平 |
| 裁切展开 | ✅ 列级（整列可点开） | ⚠️ 单元格级（点哪格看哪格） | **交互变更** |
| 列被裁切提示 `virtualColumnsClipped` | ✅ | ❌（能横向滚动了） | **有意移除** |
| `virtual-list-props` 透传 | ✅（无人使用） | ❌ | 移除 |
| `enableCellCopy` / `rowSelect` | 声明但未用 | 声明但未用 | 两侧死代码 |

---

## 4. vxe DataGrid 的改进点

### 4.1 正确性：从根本上消除"表头/内容体错位"

Arco 需要"宽度快照 + 整表重挂 + 禁用横向滚动"三件套才能维持对齐；vxe 的 colgroup 从同一 column store 派生，**结构上不会累积偏差**。

证据：列虚拟开启、横向滚动后，逐列位置偏差 **0px**（已写成断言）。

### 4.2 性能：从"每列扫全表"到"扫一遍字符串"

| 场景 | Arco DataTable | vxe DataGrid |
| --- | --- | --- |
| 232 列首个结果集（主线程长任务） | **2745ms** | **287ms** |
| 新结果集渲染 40 列 | 333ms | 106ms |
| 新结果集渲染 80 列 | 681ms | 117ms |
| 首次挂载随列数增长 | ~13ms / 列 | 基本平坦（8 列 88ms → 232 列 212ms） |
| DOM 单元格（2000 行 × 120 列） | 240,000（无虚拟） | 575~840（双向虚拟） |

### 4.3 能力：能承载日志级表格

变高行 + 双向虚拟 + 追加加载 + 链接列，这几项组合起来才可能做出日志/Grafana 式的表格。Arco 一条都给不了（变高虚拟行需要换掉它的虚拟列表实现）。

### 4.4 收敛：一套实现替代三套

`DataTable`(2070) + `PaginatedDataTable`(180) + `LogsVxeTable`(831 + utils ≈ 1000) ≈ **4100 行** → `data-grid/` **约 2400 行产品代码**，且 8 个消费方用同一套 props。

顺带清掉：Arco 虚拟路径的 43 处符号引用（死代码）、`overflow-x: hidden` + 裁切提示、整表重挂机制。

### 4.5 可测性

新增独立性能台 `perf.html`（不连库、固定假数据）+ 7 个浏览器用例，覆盖：DOM 单元格封顶、表头/内容体 0 偏差、列宽规则生效、横向滚动范围 = 列宽和 − 容器宽、页面无 console error。

这套用例直接抓到过一个线上级 bug：列宽 watcher 里的 `ReferenceError` 被 Vue 吞掉 → 所有列退化成等宽 → Flow 页横向滚动失效。

### 4.6 视觉可控

字号/行高/padding 不再由框架的 `size` 表决定，而是映射到我们自己的 token：

| size | 字号 | 行高 | padding | 行高合计 |
| --- | --- | --- | --- | --- |
| mini | 12 | 18 | 5 | 28 |
| small | 14 | 22 | 5 | 32 |
| medium | 14 | 22 | 7 | 36 |
| large | 14 | 22 | 11 | 44 |

这套值与旧 Arco 表（`size="medium"`：14px / 7px / 36px 行）一致，所以迁移后视觉没变。

---

## 5. 代价与取舍

| 取舍 | 说明 | 缓解 |
| --- | --- | --- |
| 宽度不再像素精确 | 估算 vs 实测，长内容可能被省略号截断 | 显式 `ColumnType.width`；双击边缘自适应单列 |
| 非文本内容列需显式宽度 | 按钮/徽标列只能看到表头文字 | 插槽列有 120px 兜底；动作列建议显式声明 |
| 失去 Arco 的属性透传 | `bordered` / `scroll` 不再支持 | 已无消费方依赖 |
| 裁切提示移除 | 改为可横向滚动 + 单元格详情 | 如需"右侧渐隐"提示需单独实现 |
| 用户拖拽宽度不持久 | 切列显隐后回到估算值 | 待做：写回 + 按表/列持久化 |

---

## 6. 为什么不能反向统一（vxe → Arco）

两条独立硬约束，任一条成立就否决：

1. **能力缺口**：Arco 虚拟列表只支持固定行高，而"换行 + 虚拟滚动"是日志表已上线功能。
2. **结构缺陷**：虚拟模式下宽度靠"值拷贝"同步（见 §2.1），拖动列宽无实时预览（需整表重挂）、超宽时累积错位（只能 `overflow-x: hidden`）。

要让 Arco 路线可用，得同时改掉它的行高模型和宽度同步机制 —— 那是给上游提 PR 的规模。

---

## 7. 实测对比：同一个页面、同一条 SQL

### 7.1 方法

| 项 | 值 |
| --- | --- |
| 旧版 | `http://localhost:4000/dashboard/#/dashboard/query`（GreptimeDB 内置的已发布构建，Arco DataTable） |
| 新版 | 当前工作区源码 `vite build` 后的产物，`vite preview` 在 `:4180` 提供（vxe DataGrid） |
| SQL | `SELECT * FROM opentelemetry_traces LIMIT 1000`（232 列 × 1000 行，20 行/页） |
| 数据库 | 同一个实例（`:4000`） |
| 视口 | 1600 × 900 |
| 采样 | 每个版本 3 次独立开页，取中位数 |
| 采集 | Playwright：`PerformanceObserver('longtask')` + DOM 计数 + `/v1/sql` 请求计时 |

> 两边都是**生产构建**（不是 dev server），避免"生产 vs 开发"的不公平比较。

### 7.2 结果（中位数）

| 指标 | 旧（Arco） | 新（vxe） | 变化 |
| --- | --- | --- | --- |
| 点 Run → 首行出现 | **850ms** | **490ms** | **−42%** |
| SQL 本身 | 18ms | 21ms | 持平（同一库同一 SQL） |
| 3s 窗口内长任务个数 | 3 | **1** | −67% |
| 长任务总时长 | **1446ms** | **290ms** | **−80%** |
| 最长单个长任务 | **855ms** | **290ms** | −66% |
| 内容体单元格（DOM） | **4640**（20 行 × 232 列，无列虚拟） | **180**（20 行 × 9 列，有列虚拟） | **−96%** |
| 表格 DOM 节点总数 | **29065** | **1077** | **−96%** |
| 翻到第 2 页 | 179ms | **101ms** | −44% |
| JS 堆占用 | 133MB | **54MB** | −59% |

### 7.3 怎么读这组数字

1. **首行快 42% 不是重点，"首行之后"才是。** 旧表首行 850ms 之后就有一个 855ms 的长任务 —— 用户看到表格出现、然后卡住、再看着列宽跳一次。新表首行 490ms，之后只有一个 290ms 任务，无二次跳变。
2. **长任务总量差 5 倍**，来自两处：旧表要把 232 列的宽度测出来再冻结（每列都要扫全表），新表只做字符串估算。
3. **DOM 规模差 27 倍**（29k → 1k 节点）：旧表一次性渲染 232 列 × 20 行 = 4640 个单元格；新表只渲染可见的 9 列 = 180 个。
4. **翻页快 44%**：旧表每次翻页都要重新走一遍列宽流程；新表列宽已冻结，翻页只是换数据。
5. **内存差 59%**：29k 个 DOM 节点在内存里是实打实的开销。

### 7.4 一个仍然存在的差异（不是性能）

截图对比会发现旧表能把 32 位 `trace_id` 完整显示，新表偶尔会省略号截断。

原因是估算取的是"**最长**字符串"，而同样 32 个字符的 hex id，**数字/大写占比不同，宽度也不同**——按长度选代表会漏掉更宽的那些。

修法很小：把"取最长串"换成"取估算宽度最大的串"（每列扫一遍可见页，20×232 ≈ 4600 次估算，约 2ms）。

**已应用**：`trace_id` 列从被截断变为 290px / 内容 258~267px，留有余量。同一次改动里补上了列宽持久化（见 [data-grid-migration-summary.md](./data-grid-migration-summary.md) §5）。

