# 表格统一改造：变更总结 / 特性对照 / 验证清单

> 目标：把 `DataTable`（Arco a-table）与 `LogsVxeTable`（vxe-table）两套引擎收敛成一套。
> 结论：**已统一为 `src/components/data-grid/`（vxe）**，8 个直接消费方（覆盖 10 个页面/入口）全部迁移，旧组件删除。
> 详细性能与决策过程见 [data-grid-perf-review.md](./data-grid-perf-review.md)、[table-engine-evaluation.md](./table-engine-evaluation.md)。

---

## 1. 改了什么

### 1.1 架构

```
旧：DataTable(2070)  ← 8 个消费方（查询结果/Traces/Flow/Pipelines/Metrics/Drilldown）
    LogsVxeTable(831 + utils) ← 2 个消费方（Logs Query / Drilldown Logs）
    PaginatedDataTable(180)   ← 包装 DataTable

新：data-grid/（DataGrid 1241 + Pager 103 + composables/renderers/utils 1048，其中测试 320）
    全部消费方 → DataGrid
```

代码量：约 4100 行 → **约 2400 行产品代码**（2712 行含 320 行测试）。

### 1.2 六个主题的改动

| 主题 | 改动 | 收益 |
| --- | --- | --- |
| **统一** | 一套引擎、一套分页、一套工具栏、一套空态/loading | 双引擎分裂消失 |
| **列宽** | 不再用 DOM 测量（`calcColumnAutoWidth` 是 O(列×单元格)），改为按字符类别估算；保留"双击表头边缘自适应单列" | 232 列首帧 2.7s → 0.2s |
| **虚拟化** | 不再区分"虚拟表/非虚拟表"，改由行数/列数阈值（`gt`）决定；横向虚拟在稳态始终开启（含换行） | 120 列 DOM 2400 → ~460 单元格 |
| **渲染次数** | 列签名未变时复用宽度；相同宽度不重复赋值；删掉"测量→重建列"两连跳 | 新结果集渲染 333→106ms（40 列）、681→117ms（80 列） |
| **样式** | 字号 12→14、字体回 Geist、padding 7px、行高 36、hover/活动行/边框/空态按旧表还原 | 视觉与旧表一致 |
| **测试** | 23 个单测 + 7 个浏览器性能/回归用例（独立性能台 `perf.html`） | 可回归 |

### 1.3 顺带修掉的问题

- Traces 的单元格过滤菜单在迁移中丢失（`showContextMenu` 默认值从 `true` 变 `false`）→ 已恢复
- Flow 横向滚动失效：列宽 watcher 里的 `ReferenceError` 被 Vue 吞掉，规则退化成"均分列宽"→ 已修 + 回归用例
- 过滤操作符不再固定 8 项，改为按列类型（复用 `filterOpsForType`）
- `vitest` 会把 `.worktrees/` 里另一份 checkout 的测试也算进来 → 已排除

---

## 2. 原表格特性对照

| # | 特性 | 旧 DataTable | 新 DataGrid | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 合并列 `separate` / `merged` / `merged-with-keys` | ✅ | ✅ | 持平 |
| 2 | JSON 列：美化输出 + 隐藏 null + 表头菜单 | ✅ | ✅（`renderers/renderJsonHeader`） | 持平 |
| 3 | 语义表头（主键 / tag / 字段 / 时间戳 图标与配色） | ✅ | ✅（`renderSemanticHeader`） | 持平 |
| 4 | 时间列：点击切换格式化/原始值 + 时区 tooltip | ✅ | ✅ | 持平 |
| 5 | 单元格右键：过滤 + 复制 | ✅（固定 8 个操作符，String 列也出现 `>`） | ✅（按列类型，含 `copy`） | **改进** |
| 6 | 行尾操作图标（`⋮`） | ❌ | ✅ | 改进 |
| 7 | 链接列（trace_id 可点） | ❌ | ✅ `linkColumn` | 改进 |
| 8 | 追加加载 load-more + 视口自动补 | ❌ | ✅ | 改进 |
| 9 | 虚拟滚动 | Arco（固定行高，实际无人使用） | vxe 双向 + 变高行 | 改进 |
| 10 | 分页 | 外部包装（footer 分页 / 卡片头分页 两套） | 内建一套（footer 或卡头由页面决定） | 统一 |
| 11 | 列宽可拖拽 | ✅ | ✅ + 双击自适应单列 | 改进 |
| 12 | `leftoverStrategy`（last-column / proportional） | ✅ | ✅ | 持平 |
| 13 | 空态图标 / loading / 活动行高亮 | ✅ | ✅ | 持平 |
| 14 | **裁切展开 popover**（列被裁切 → 该列单元格可点开看全文） | ✅ 列级 | ⚠️ 改为**单元格级**：点哪个格看哪个格 | **交互变更** |
| 15 | **`virtualColumnsClipped` 裁切提示** | ✅ | ❌ 移除（横向滚动恢复后不再需要） | **功能移除（有意）** |
| 16 | `virtual-list-props` 透传（Arco 原生虚拟列表） | ✅（无人使用） | ❌ 不支持 | 移除 |
| 17 | `enableCellCopy` prop | 声明但未实现 | 声明但未实现 | **两侧都是死 prop** |
| 18 | `rowSelect` 事件 | 有 emit | 无 emit | **缺失（但无消费方）** |
| 19 | `scroll` / `bordered` / `show-header` 透传给 a-table | ✅（flow 用过 `scroll`，实为空操作） | `show-header` 是 props；`scroll`/`bordered` 不再支持 | 移除 |

**需要你确认的两处**：

1. **#14 裁切展开**：旧表是"这列被裁了 → 整列都能点开"，新表是"点哪个格看哪个格"。日志表一直是后者，迁移时统一成了后者。如果产品上希望保留"整列可点"，需要额外实现。
2. **#15 裁切提示**：旧的 `virtualColumnsClipped` 是 Arco 不能横向滚动时的补偿；现在能滚了，提示已移除。如果希望保留"列被裁切"的视觉提示（比如右侧渐隐），需要单独加。

---

## 3. 受影响页面

| # | 页面 / 入口 | 组件链 | 关键点 |
| --- | --- | --- | --- |
| 1 | **Query（SQL 结果）** | `data-view` → `QueryResultTable` → DataGrid | 分页 20/页、时间戳点开详情、JSON 列菜单、语义表头、复制、换行/紧凑、单元格明细抽屉 |
| 2 | **Metrics Query** | `metrics/index.vue` | 无表头（`show-header=false`）、无边框、`#column-series` / `#column-values` 自定义列 |
| 3 | **Metrics 查询结果面板** | `drilldown/metrics/query-results-panel` | 无分页、数据量可能较大、无右键菜单 |
| 4 | **Traces Query** | `TraceTable` | 分页在卡片头、`#column-trace_id` 插槽 + 链接、builder 模式右键过滤、列显隐、活动行 |
| 5 | **Logs Query** | `LogsTable` | load-more、合并列、换行、紧凑、trace_id 链接、右键过滤、详情抽屉 |
| 6 | **Drilldown → Logs** | `logs-main-view` → `LogsTable` | 同上 + severity 过滤联动、`filter-menu-kind=drilldown` |
| 7 | **Drilldown → Logs → Labels** | `label-value-panel` → `LogsTable` | 过滤菜单、紧凑表格 |
| 8 | **Flow** | `flow/index.vue` | `fill-height=false`（页面级滚动）、`proportional` 列宽、状态 pill、Actions 按钮（显式 168px）、横向滚动 |
| 9 | **Logs Pipelines** | `PipeFileView` | 换行、只读、无右键 |
| 10 | **Markdown Playground** | `markdown-render/code-editor` | 分页、无右键、表格 + 图表切换 |

---

## 4. 验证清单

### 4.1 自动化（已通过）

```bash
pnpm test          # 546 个单测；唯一失败是仓库原有的 signal-binding.test.ts
pnpm perf          # 7 个浏览器用例：渲染预算 + 双向虚拟 + 表头对齐 + 列宽规则 + 滚动范围
pnpm build         # 生产构建
```

浏览器用例覆盖：DOM 单元格封顶、表头/内容体 0 偏差、列宽随内容变化、横向滚动范围 = 列宽和 − 容器宽、页面无 console error。

### 4.2 手工逐页验证（按优先级）

**P0（必看）**

| 页面 | 验证点 |
| --- | --- |
| Query | ① 分页翻页/改页大小 ② 点时间戳打开详情抽屉、活动行高亮 ③ JSON 列：美化 + 表头菜单隐藏 null ④ 语义表头图标 ⑤ 右键复制 ⑥ 换行/紧凑切换 |
| Logs Query | ① 滚动到底自动 load-more ② 合并列三态 ③ 换行后行高正确、滚动不抖 ④ trace_id 点击跳转 ⑤ builder 模式右键过滤项随列类型变化 ⑥ 详情抽屉 |
| Traces | ① 卡片头分页 ② trace_id 链接 ③ 列显隐 ④ 横向滚动到最右能看到最后一列 ⑤ 232 列时的首帧（应 < 1s 渲染） |
| Flow | ① 横向滚动到最右，Actions 两个按钮完整可见 ② 页面级滚动（表格不塌陷）③ 状态 pill ④ 编辑/删除 |

**P1**

| 页面 | 验证点 |
| --- | --- |
| Metrics | 无表头时行对齐、series/values 两列渲染 |
| Drilldown 各表 | 与旧视觉一致、无多余边框 |
| Pipelines | 换行、只读 |
| Markdown Playground | 分页、表格/图表切换 |

**跨页面一致性（建议一屏对比）**

- 字号 14 / 行高 36；`size=mini` 时 12 / 28
- 表头：14px / 600 / `#8b7ba8` / 背景 `#eeecf0` / 列间竖分隔
- 正文 `#473460`；hover 紫色 8%；活动行紫色 + 左侧 3px 竖条
- 空态：mono 14px + 52px 图标

### 4.3 建议补的验证点（当前没有自动化）

- 拖拽列宽后切换列显隐，宽度是否被重置（**已知风险**：用户拖拽的宽度没有写回宽度规则）
- 双击表头边缘自适应单列（vxe `isDblclickAutoWidth`）

> 换行 + 宽表的首帧已复测，不再是风险：`recalcRowHeight`（采样 100 行）在 20/50/232 列下分别是 13/11/31ms；2000 行 × 232 列开换行挂载 583ms，与不开换行（505ms）只差 ~80ms。

---

## 5. 已知遗留

| # | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | 用户拖拽的列宽不持久 | 切列显隐/重新查询后跳回估算值 | 监听 `column-resizable-change`，`pointerup` 时写回并按 `表名+列名` 持久化 |
| 2 | 内容不是纯文本的列（按钮/徽标）只能靠显式 `width` | 忘写就会被裁 | 已在 `ColumnType` 上暴露 `width`；考虑给常用动作列一个约定宽度 |
| 3 | 列集合不变时宽度不随新数据变化 | 新查询内容明显变长时省略号截断 | 可加"自适应列宽"按钮触发一次重算 |
| 4 | `enableCellCopy` / `rowSelect` 是死代码 | 无功能影响 | 删除或补实现 |
| 5 | Traces 主查询 SQL 仍拉全表 232 列 | 1.9s 在后端 | 只 SELECT 展示列 |

> 注：早期记录里"2000 行 × 120 列 + 换行首帧 10 秒"是**移除列宽测量之前**的数字（测量要求每列以 natural 宽度布局，换行会放大这个成本）。移除测量后复测为 ~0.6s，该结论已作废。
