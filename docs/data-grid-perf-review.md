# DataGrid 渲染性能评审

> 对象：`src/components/data-grid/DataGrid.vue`（统一后的 vxe 表格）
> 场景：Traces 页面列多、查询后重新渲染慢
> 方法：先用纯函数基准确认 JS 侧不是瓶颈，再用 Playwright 在真实浏览器里量 DOM 渲染，并给组件加临时计数器定位"渲染放大"。

---

## 1. 结论

| | 修复前 | 修复后 | 变化 |
| --- | --- | --- | --- |
| 40 列 · 新结果集渲染 | 333ms | **106ms** | -68% |
| 80 列 · 新结果集渲染 | 681ms | **117ms** | -83% |
| 120 列 · 新结果集渲染 | ~1000ms（外推） | **144ms** | ~-85% |
| 80 列 · DOM 单元格数 | 1600 | **480** | -70% |
| 120 列 · DOM 单元格数 | 2400 | **480** | -80% |
| 首次挂载（40 列） | 683ms | 663ms | 持平 |
| 首次挂载（120 列） | — | 1777ms | **仍偏慢，见 §4** |

JS 侧从来不是瓶颈：`buildDisplayRows` 1000 行 × 40 列中位 **5.6ms**，`buildVxeColumns` **0.1ms**。所以优化全部落在"渲染次数"和"DOM 规模"上。

---

## 2. 根因：渲染放大约 12 倍

给 `DataGrid` 加临时计数器（已移除）后，40 列 × 20 行 = 800 个可见单元格，实测：

| | `relayout` | `measure` | `recalculate` 次数 | `renderSeparateCell` 调用 |
| --- | --- | --- | --- | --- |
| 首次挂载 | 1 | 1 | 1 | **14,000** |
| 新结果集 | 1 | 1 | 1 | **10,200** |

即每个单元格平均被渲染 **12.7 次**。两个来源：

1. **列集合被重建两次**。`relayout()` 先把 `frozenWidths` 置空（列变回 `width:'auto'`）→ 整表重渲染 → 测量 → 写回 px → **再次整表重渲染**。每次列集合变化都会让 vxe 重建列并重渲染全部单元格。
2. **没有列虚拟化**。`virtualXConfig = { enabled: false }` 是静态的，所以 80 列就是 20 × 80 = 1600 个真实 DOM 单元格；而正文只需要首屏那 400~500 个。

---

## 3. 已修复

| # | 修改 | 文件 |
| --- | --- | --- |
| 1 | **列虚拟化在稳态开启**，仅在测量期间关闭（`calcColumnAutoWidth` 需要所有列都在 DOM 里）。 | `DataGrid.vue` `virtualXConfig` + `measuring` |
| 2 | **列签名未变时复用已测宽度**，新结果集不再重新测量，也不再重建列集合。 | `DataGrid.vue` `columnSignature` / `measuredSignature` / `onDataRendered` |
| 3 | **相同宽度不再赋值**，避免一次无意义的整表重渲染。 | `DataGrid.vue` `sameFrozenWidths` |
| 4 | **列元数据查找从 `columns.find()` 改为 `Map`**，去掉 row × field × columns 的三重扫描。 | `utils/table-data.ts`、`utils/vxe-columns.ts` |
| 5 | **恢复 Traces 的单元格过滤菜单**：`DataGrid.showContextMenu` 默认 `false`，而旧 `DataTable` 默认 `true`，迁移后该功能静默消失。 | `TraceTable.vue` |

验证：列虚拟化下**表头与内容体列位置逐列完全一致**（最大偏差 0px），横向滚动正常。这条已写成断言，防止将来退化。

---

## 4. 遗留问题（未修，需要决策）

| # | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | **首次挂载仍随列数线性变慢**（120 列 1.8s） | 只影响首次进入页面（Traces 有 keep-alive） | 测量放进 `requestIdleCallback`，或对超宽表限制测量列数（首屏 + 采样）。需要确认"首屏闪一下 auto 宽度"是否可接受 |
| 2 | **用户拖拽的列宽不会写回 `frozenWidths`** | 拖完再切换列显隐 / 触发列重建 → 宽度跳回 | 监听 `column-resizable-change`，在 `pointerup` 时提交（注意别在拖动过程中重建列——这正是 Arco 踩过的坑） |
| 3 | **列集合不变时宽度不再随新数据变化** | 新查询内容明显变长时会被省略号截断 | 取舍：换来 3~6× 的渲染提升。后续可加"自适应列宽"按钮触发一次重测 |
| 4 | ~~`wrapLine` 开启时不做列虚拟化~~ **已修正**：验证后换行 + 变高行 + 横向虚拟共存正常（列位置 0 偏差、行高 27/44 混排无重叠），已移除该限制 | 日志表「换行 + 多列」场景 DOM 从 3960 降到 ~760 单元格 | — |
| 5 | `relayout()` 的"封顶判定"最多跑 3 次 `recalculate`（测→不封顶→再封顶） | 少数窄表首渲染多一次 | 可用第一次封顶测量的总和预估是否溢出，省掉一次 |
| 6 | `@data-rendered` 每次渲染都会触发 | 现在很便宜（列签名未变直接返回） | 保留即可，但要知道它曾是放大来源 |

---

## 4.5 为什么要测列宽（TraceTable 不是虚拟表，为何还要测）

这是个合理的疑问，因为"虚拟"和"测量"是两件事，容易混在一起：

| 问题 | 由什么决定 | 说明 |
| --- | --- | --- |
| **需不需要给列宽** | 表格引擎 | VXE 用 `<colgroup>` + `table-layout: fixed` 渲染，**不会**用浏览器的 auto 布局。不给宽度就均分（`bodyWidth / 列数`），长短内容悬殊时不可用。所以"宽度从哪来"是必答题，不是虚拟表才要答 |
| **宽度怎么来（实测 vs 估算）** | 是否虚拟 | 虚拟表只能测到已渲染的行 → 只能估算；非虚拟表能测到所有行 → 可以实测。**这才是"虚拟/非虚拟"的差别** |
| **测完要不要冻结成 px** | 是否频繁 recalculate | `width:'auto'` 会让 VXE 每次 recalculate 都重读所有单元格的 `scrollWidth` |

实测（40 列 × 20 行，TraceTable 的场景）：

| | 翻页（点下一页） | 新结果集 |
| --- | --- | --- |
| 测量后冻结成 px（当前实现） | **205ms** | **119ms** |
| 永不冻结（全部 `width:'auto'`） | 283ms | 229ms |

所以冻结是值得的：翻页 -28%、查询 -48%。而且现在**只在列集合变化时测量**（`columnSignature` 复用），TraceTable 一次会话只付一次测量成本，查询和翻页完全不测。

### 剩下的问题：测量成本随列数线性增长

因为测量要求"所有列都在 DOM 里"（否则 `calcColumnAutoWidth` 读不到），首帧必须关掉列虚拟化，渲染 `行 × 列` 个单元格：

| 列数 | 20 | 40 | 80 | 120 | 160 |
| --- | --- | --- | --- | --- | --- |
| 首次挂载 | 352ms | 607ms | 1049ms | 1610ms | 2178ms |

约 **base 330ms + 13ms/列**。TraceTable（~25 列）约 650ms 可接受；日志表（50+ 列）接近 1s。

**已实施分档 → 之后进一步取消了测量，见 §4.9**（下表的测量数据仍可用于理解成本曲线）：

| 列数 | 策略 | 首帧实测 |
| --- | --- | --- |
| ≤ 40 | DOM 实测（像素精确） | 20 列 350ms / 40 列 634ms |
| > 40 | 字符估算（`8px/字符 + 32px padding`，cap 600，从已字符串化的行取值，零 DOM 读取） | 41 列 137ms / 120 列 158ms / 200 列 190ms / 232 列 199ms |

拐点很陡（40 → 41 列：634ms → 137ms）—— 这正好证明成本来自测量本身，而不是渲染列数。

判据从"是否虚拟"变成"列数是否值得为像素精度付出首帧"，与虚拟化彻底解耦：估算模式下不需要 `measuring`，横向虚拟从第一帧就开着。

---

## 4.6 行虚拟 + 多列：横向虚拟是支持的（含换行）

实测 `2000 行 × 120 列`，未分页（走行虚拟）：

| 场景 | 表头列 | 渲染行 | 渲染 body 单元格 | 列位置偏差 |
| --- | --- | --- | --- | --- |
| 行虚拟 + 120 列 | 120 | 25 | **575** | 0px |
| 行虚拟 + 120 列，横向滚动后 | 120 | 25 | 675 | 0px |
| 行虚拟 + 换行（行高 27/44 混排） | 120 | 33 | **759** | 0px |
| 行虚拟 + 换行，横向 + 纵向滚动后 | 120 | 30 | 840 | 0px |

完全渲染会是 2000 × 120 = **240,000** 个单元格；实测稳定在 575~840。

两点值得记住：

1. **表头列不虚拟化**（始终 120 个 `<th>`）。VXE 需要用完整 `colgroup` 计算总宽和滚动范围。表头单元格本身很轻，不是瓶颈。
2. **换行不会破坏横向虚拟**。之前为了"行高正确"把 `wrapLine` 排除在列虚拟化之外，实测发现两者可以共存：行高由 `recalcRowHeight` 管理，列虚拟只影响哪些列进 DOM，互不干扰。已移除该限制（日志表 3960 → ~760 单元格）。

---

## 4.7 不再区分"虚拟 / 非虚拟"：改成阈值

原来的策略是应用层判断：

```ts
// 旧
isVirtual = pagination ? false : rowCountAtResultStart > 500
virtualYConfig = { enabled: isVirtual, gt: 0 }   // gt:0 表示"只要 enabled 就一直虚拟"
```

问题是它把两件无关的事绑在一起了：**"是否分页"和"行数是否值得虚拟"**。分页 100 行和未分页 100 行，对布局来说是同一件事。

改成由 VXE 自己按行数判断（`gt` = 超过多少行才启用）：

```ts
// 新
virtualYConfig = { enabled: props.virtual !== false, gt: props.virtualThreshold }  // 默认 gt = 50
virtualXConfig = { enabled: true, gt: 8 }   // 唯一的例外：测量期间必须关（见 §4.5）
```

实测四种输入，行为符合预期：

| 输入 | 渲染行数（= 是否虚拟） |
| --- | --- |
| 分页 20 行 | 20（不虚拟） |
| 未分页 40 行 | 40（不虚拟，低于 gt） |
| 分页 100 行 | **24（虚拟）** ← 旧策略下不会虚拟 |
| 未分页 2000 行 | 25（虚拟） |

顺带删掉的东西：

- `isVirtual` computed、`rowCountAtResultStart` 及其 watcher（原本为了"分页结果集稳定"而记的初始行数）；
- "分页就永不虚拟"这条耦合；
- `virtualThreshold` 默认值 500 → 50（一个视口约 20~25 行，50 行以上虚拟才有意义）。

`virtual: false` 仍保留为显式退出（`PipeFileView` / `flow` / `label-value-panel` 这类小预览依赖普通文档流）。

**剩下的唯一例外不是"虚拟 vs 非虚拟"，而是"测量 vs 正常渲染"**：测量要读每一列的 `scrollWidth`，所以必须让所有列都在 DOM 里。等 §4.5 的"宽表改字符估算"落地，`measuring` 这个状态也可以删掉，那时才是真正的全局无分档。

---

## 4.8 线上排查记录：Traces 页面点查询后慢

用 Playwright 在真实页面（`localhost:5177` + 本地 GreptimeDB）上打点，定位到两个完全不同的瓶颈。

### 现象

| | 修复前 | 修复后 |
| --- | --- | --- |
| 点击 Run → 首行渲染 | **4104ms** | **2199ms** |
| 主线程长任务总计 | **2893ms** | **427ms** |
| 最长单个长任务 | **2745ms** | 265ms |

### 归因

1. **前端 2745ms 的单个长任务** —— 发生在 232 列的结果集到达时（`opentelemetry_traces` 有 **232 列**）。这是列宽测量：`calcColumnAutoWidth` 每列都要 `querySelectorAll` 整个表并读每个单元格的 `scrollWidth`，复杂度 O(列数 × 单元格数) = 232 × 4640。
   → 由 §4.5 的分档修复（>40 列改估算），该长任务降到 265ms。

2. **剩下的 2.2s 里约 1.9s 是 SQL 本身**：

   | 查询 | 行数 × 列数 | 耗时 |
   | --- | --- | --- |
   | traces 主查询 | 1000 × 232 | 1948ms |
   | Row Count Over Time | 200 × 2 | 838ms |
   | 其他元数据查询 | 11 × 1 / 1 × 1 | 158ms / 202ms |

   这是后端/查询侧的成本，`DataGrid` 不再占大头。要继续压只能从 SQL 下手（例如不 `SELECT *` 232 列、只取展示列），不在本次范围。

### 复现方式

```bash
pnpm dev                     # 5177
# 打开那条 traces URL，点 Run
# 用 Playwright 打点：PerformanceObserver('longtask') + /v1/sql 的 request/response 计时
```

---

## 4.9 最终方案：不再测量列宽（vxe 的机制与取舍）

### 为什么原本要测量

VXE 用 `<colgroup>` + `table-layout: fixed` 渲染，**不会**用浏览器的 auto 布局。不指定宽度时所有列进 `remainList`，`meanWidth = bodyWidth / 列数` → **等宽**；`fit` 只负责把"剩余空间"分掉，不推断内容宽度。所以"内容多的列更宽"必须由我们materialize 成像素。

### vxe 自己提供的三种机制

| 机制 | 行为 | 成本 |
| --- | --- | --- |
| `width: 'auto'` / `minWidth: 'auto'` + `column-config.autoOptions` | `calcColumnAutoWidth` 对**每一列** `querySelectorAll` 整表 + 读每个单元格 `scrollWidth` | **O(列数 × 单元格数)**：232 列 = 2.7s |
| `resizable-config.isDblclickAutoWidth` | 双击表头右边缘 → **只测这一列** | 单列，几毫秒 |
| `fit` + 列宽分类（`pxList`/`autoList`/`remainList`…） | 只决定剩余空间怎么分 | 无 |

结论：vxe 没有"零成本的内容自适应"。它的设计假设是**宽度主要由开发者/用户决定**，`auto` 只是便利功能。

### 采用：估算为主 + 按需精确

| 层 | 做法 | 成本 |
| --- | --- | --- |
| 默认 | 用已字符串化的行做字符估算（无 DOM 读取） | O(行 × 列) 字符串扫描，232 列 < 1ms |
| 按需 | `isDblclickAutoWidth`：双击列边缘，只测那一列 | 单列，几 ms |
| 后续 | 用户调过的宽度持久化到 `uiConfig`（按表+列） | — |

**估算的两个关键细节**（都是踩出来的）：

1. **系数要偏高，不要偏低**。实测每字符宽度在 6.3px（小写单词）到 8px（hex id / 数字 / 大写）之间。我先按 6px 校准，结果 timestamp 和 trace_id 双双被截断（低估 → 截断是用户可见的坏结果；高估只是把余量给吸收列）。最终取 **8px**。
2. **全角要加权**。CJK 字符宽度约为拉丁字符的 2 倍，否则中文列会全部截断。

### 效果

| 指标 | 测量方案 | 估算方案 |
| --- | --- | --- |
| 挂载（8 列） | — | 88ms |
| 挂载（40 列） | 607ms | **149ms** |
| 挂载（120 列） | 1610ms | **179ms** |
| 挂载（232 列） | ~2700ms | **212ms** |
| 挂载随列数增长 | ~13ms/列 | **基本不变** |
| Traces 页面首个结果集长任务 | 2745ms | **287ms** |
| Traces 首行渲染 | 4104ms | **1974ms**（其中 1.9s 是 SQL） |

顺带删掉的代码：`relayout` / `measure` / `readMeasurement` / `frozenWidths` / `columnSignature` / `measuring` / `layoutPending` / `capped` / 容器 resize 的封顶判定，以及测宽用的 `[data-calc-col]` CSS —— 共约 120 行。

---

## 4.10 样式对齐：恢复 DataTable 的视觉（字体 / 字号 / 颜色 / 边框）

迁移到 vxe 后最直观的问题不是性能，是**"看起来不一样了"**。根因是两套引擎的默认排版不同：

| 项 | 旧 DataTable（Arco `size="medium"`） | 新 DataGrid（vxe `size="mini"`） | 已改为 |
| --- | --- | --- | --- |
| 字号 | **14px** | 12px | 14px |
| 字体 | **Geist**（`--font-family-base`） | vxe 的 system-ui 栈 | Geist |
| 行高 | 22px | 22px | 22px |
| 单元格纵向 padding | **7px** | 5px | 7px |
| 行高合计 | **36px** | 36px（但字号 12） | 36px |
| 表头 | 14px / 600 / `--gpt-text-secondary` / `#eeecf0` | 同色同重，字号 12px | 14px |
| 正文颜色 | `--gpt-text-primary` (#473460) | #1d2129 | #473460 |
| 行 hover | `--gpt-table-row-hover-bg`（紫色 8%） | 中性灰 #f7f8fa | 紫色 8% |
| 活动行 | `--gpt-nav-active-bg` + 左侧 3px 内阴影 | 蓝色 #e8f3ff | 紫色 + 左侧 3px 内阴影 |
| 边框 | 表头竖分隔 + 行分隔，无外框 | `border="inner"`（含竖线） | `border="default"` |
| 空态 | mono / 14px / 52px 图标 | 12px | mono / 14px / 52px |

字号是按 `props.size` 走的，和行高一一对应（`mini` 12/28、`small` 14/32、`medium` 14/36、`large` 14/44），因此日志表的紧凑模式不受影响。

### 顺带修正：列宽估算必须跟着字号走

字号从 12px 变 14px 后，原来按"8px / 字符"估的宽度就偏窄了，timestamp 和 32 位 trace_id 立刻被截断。实测 14px Geist 的字符宽度：

| 内容 | 实际 | 每字符 |
| --- | --- | --- |
| `row-0-col-0`（小写+连字符） | 79.3px | 7.2 |
| `2026-11-04 16:10:21.615`（数字为主） | 160.5px | 7.0 |
| `4812e7ae...`（32 位 hex） | 260.4px | 8.1 |
| `STATUS_CODE_UNSET`（大写+下划线） | 151.8px | 8.9 |
| `错误日志查询`（CJK） | 83.4px | 13.9 |

单一系数覆盖不了 7.0~8.9 的跨度：按 6px 校准会让 hex 截断，按 8.9 会让时间戳列多占 30%。改为按字符类别加权（相对字号）：小写/标点 0.52em、数字/大写 0.63em、CJK 1.0em。

另外两点：

- **有父级插槽的列要额外留装饰宽度**（+28px）：插槽里可能是按钮、上下文菜单图标、flex gap，纯文本宽度估不出来。
- **不要往低里估**：低估 = 内容截断（用户可见的坏结果），高估 = 余量交给吸收列。所以每档都取上沿。

---

## 4.11 Flow 页横向滚动失效：一个被我引入的静默失败

现象：Flow 表格右侧列内容看不全，横向滚动条拖到最右也够不着。

### 根因

列宽规则是在一个 watcher 里算的：

```ts
watch(() => [...], () => {
  const next = computeColumnWidthRules(fields, estimateColumnWidths(), strategy)
  ...
}, { immediate: true })
```

我在加"插槽列最小宽度"时，**只加了 `SLOT_MIN_WIDTH_PX` 的引用、忘了声明**，于是 watcher 第一行就抛 `ReferenceError`。

**Vue 会捕获 watcher 里的错误并继续运行** —— 所以没有任何中断、没有白屏，只是 `columnWidthRules` 永远停在 `{}`：

- 列没有任何 `width` / `minWidth`
- VXE 把 7 列全部丢进 `remainList`，均分容器宽度 → 每列 181px
- 长列（source_table_names 实际需要 2306px）被截断
- 表格宽度 == 容器宽度 → **没有横向溢出 → 滚动条范围 0**

这就是"滚动条计算有问题"的真相：不是 vxe 算错了，是列宽压根没生效。

### 次因

`Actions` 列的内容是按钮，但估算只能看到表头文字 `"Actions"` → 103px，实际按钮需要 141px，即使规则正常也会被裁。

### 修复

1. 补上缺失的常量（真正的 bug）；
2. 插槽列最小宽度 **120px**；
3. `ColumnType` 支持显式 `width`，Flow 的 Actions 列声明为 **168px**（两按钮 + gap + padding）。

修复后：7 列合计 2632px，容器 1205px，横向滚动范围 1427px（= 2632 − 1205），Actions 单元格 168px / 内容 140px。

### 回归防护

新增浏览器用例断言三件事，正是这次全部失效的点：

| 断言 | 能抓到的问题 |
| --- | --- |
| 页面无 `pageerror` / `console.error` | 本次的 `ReferenceError`（被 Vue 吞掉） |
| 列宽不是全等（max − min > 100） | 规则退化成 `{}`、均分列宽 |
| `x-handle` 滚动范围 == `sum(列宽) − clientWidth` | 滚动范围算错 / 最后一列够不着 |

---

## 5. 测试

### 5.1 单元（node，`pnpm test`）

`src/components/data-grid/utils/render-pipeline.perf.test.ts`

- 只格式化 `displayedColumns` 里的列（隐藏列不参与），时间列才走 `textOf`；
- 2000 行 × 40 列在预算内（防 `columns.find()` 这类 O(n²) 回潮）；
- `buildVxeColumns` 50 次重建在预算内；
- 有父级插槽的列必须走插槽渲染器；
- `computeColumnWidthRules` 的 auto / frozen / absorber / proportional 四种形态。

### 5.2 浏览器（真实渲染，`pnpm perf`）

`tests/perf/data-grid.perf.spec.ts` + `playwright.perf.config.ts` + `config/vite.config.perf.ts`

- 独立性能台 `perf.html`：**不连数据库、不登录、固定假数据**，所以数据可比。
- 断言分两类，避免把 CI 抖动当回归：
  - **确定性**：DOM 单元格数被封顶（40 列 < 700、120 列 < 900）；表头与内容体列位置逐列 0 偏差；同一列集合下新结果集的列宽逐列不变。
  - **时间预算（宽松）**：40 列 < 500ms、120 列 < 600ms（修复前 120 列约 1s）。
- 数字都 `console.log` 出来，失败时能直接看到实测值。

```bash
pnpm dev:perf          # http://127.0.0.1:5180/perf.html?rows=20&cols=120
pnpm perf              # 跑 4 个性能用例
```

> `perf.html` 不会进生产包：`createHtmlPlugin` 的 `pages` 固定了 `build.rollupOptions.input`，`dist/` 里只有 `index.html` / `dashboard.html`（已核对）。

---

## 6. 一条经验

**判断前端渲染问题，先分离"JS 计算"和"DOM 渲染"。** 这次两边的差距是两个数量级：JS 5.6ms vs 渲染 681ms。如果按直觉去优化 `buildDisplayRows`，会花很久却几乎无感；真正的问题是同一个单元格被渲染了 12 次，以及 1600 个本不该存在的 DOM 节点。
