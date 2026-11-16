# 阶段 0（改版）：可视化基线 + 最小自动护栏

> 上位文档：[component-consistency-audit.md](./component-consistency-audit.md)
> 前一版（全是测试）已被否决，原因与替代思路见 §0。旧文件 `docs/phase-0-test-harness-plan.md` 已删除。

---

## 0. 为什么改掉前一版

前一版的实际内容：`test.projects` 分层 + `@vue/test-utils` + `jsdom` + 15 个测试文件。**产品代码只有"等价提取"，没有一个组件被实质改动。** 这有两个问题：

1. **和实际工作方式不匹配**。前端改动的验证手段本来就该是"改 → 看"，测试跑绿了也不能证明间距、对齐、交互手感是对的。
2. **投入产出错**。浅层组件测试测的是实现（"有没有渲染出 3 个 `td`"），不是体验（"三张表的行高看起来一样吗"）。这类断言写起来贵、维护贵、拦住的问题少。

但"一致性"这件事有一个前提不能省：**你现在没有任何一个地方能同时看到全部实现**。想判断 `DataTable` 和 `LogsVxeTable` 的行高/空态/时间戳样式是否一致，得开四个页面、点开、对比、凭记忆。这才是阶段 0 真正缺的东西——不是测试，是**观察台**。

而且阶段 0 之后要动的是 2000 行级的表格组件。没有观察台的"统一组件"重构，等于蒙眼拆弹。

**所以改版方向：把预算从"写测试"移到"建观察台"**，只保留 3 个眼睛确实看不过来的逻辑测试。

---

## 1. 判断依据：哪些交给眼睛，哪些必须交给机器

| 要验证的东西 | 人体工学 | 手段 |
| --- | --- | --- |
| 行高 / 间距 / 对齐 / 颜色 / 空态观感 | 眼睛 1 秒就能判断 | **实验室并排对比** |
| 图例点击、拖拽缩放、tooltip 手感 | 必须真交互 | **实验室手动点** |
| 三张表的工具栏是否长得一样 | 眼睛 | **实验室并排** |
| 时间轴格式 × 7 个跨度 × 3 个时区（21 组合） | 人眼没法逐一造 | **机器**（唯一值得写的类型之一） |
| 过滤操作符 × 10 种列类型 × 3 种模式 | 同上，且要连库才能看到 | **机器** |
| localStorage 迁移（"带着旧 uiConfig 刷新"） | 平时根本观察不到 | **机器** |
| props 签名漂移 | 编辑器/Build 就能发现 | **类型检查**（⚠️ 目前是坏的，见 §5） |

结论：机器只负责**组合爆炸**和**不可见路径**，其余全交给实验室。

---

## 2. 交付物总览

| 批次 | 内容 | 性质 | 估时 |
| --- | --- | --- | --- |
| **0A** | 组件实验室（dev-only 页面） | 新增页面，可交互 | 1.5d |
| **0B** | 行为契约单 `docs/component-contract.md` | 文档（判定标准） | 0.5d |
| **0C** | 3 个组件修复（可眼看验证） | 产品代码 | 1d |
| **0D** | 3 个"眼看不出来"的测试 | 测试 | 0.5d |
| **0E**（可选） | Playwright 视觉回归（接在 lab 上，12 个 case 截图比对） | 自动化 | 1d |

合计 **3.5d**（不含 0E），产出物里 0A/0B/0C 都是你直接能看见、能点的东西，只有 0D 是测试。0E 是"想让机器长期替你看"时才做的——它比组件测试值，但比 lab 晚一步做。

---

## 3. 0A — 组件实验室（1.5d，主产出）

### 3.1 它是什么

一个 **dev-only 的独立页面**，用固定假数据把「所有表格实现 × 所有图表实现 × 各种状态」并排渲染出来。改一行样式，刷新一次，四处同时变。

```
http://localhost:5177/lab.html                         # 总览
http://localhost:5177/lab.html?case=table-row-height   # 单例，便于截图对比
```

### 3.2 零配置原理（已验证，不需要改任何构建配置）

- **dev 可访问**：Vite dev server 会直接服务根目录下的 `.html`，无需注册。
- **prod 不会构建**：`createHtmlPlugin` 的 `pages` 会**覆盖** `build.rollupOptions.input`（已核源码 `vite-plugin-html/dist/index.mjs:109-116`），当前只有 `index.html` / `dashboard.html` 两项。根目录新增的 `lab.html` **不会进生产包**。
- 因此 `lab.html` 不需要写进 `config/vite.config.base.ts`，也不会打到用户侧。

> 落地时用 `pnpm build && ls dist/*.html` 复核一次即可（预期只有 `index.html`、`dashboard.html`）。

### 3.3 文件

```
lab.html                          # 入口 html，和 index.html 同构，挂 #lab
src/lab/main.ts                   # ~30 行：pinia + i18n + ArcoVue + globalComponents + 两份全局样式
src/lab/App.vue                   # 左树右内容 + 「并排对比」开关 + ?case= 深链
src/lab/fixtures/table.ts         # 12 行确定性数据、ColumnType[]（含 timestamp / json / numeric / string）
src/lab/fixtures/series.ts        # 3 条时间序列（含 gap、负值、超长 name）
src/lab/cases/table/*.vue         # 每个 case 一个文件
src/lab/cases/chart/*.vue
src/lab/cases/state/*.vue
```

`src/lab/main.ts` 必须镜像 `src/main.ts` 的这几步（少一步就会"长得不像"）：

```ts
import { createApp } from 'vue'
import ArcoVue, { FormItem } from '@arco-design/web-vue'
import ArcoVueIcon from '@arco-design/web-vue/es/icon'
import { createPinia } from 'pinia'
import globalComponents from '@/components'   // 全局组件 + echarts 注册
import '@/assets/icons'                        // svg sprite，否则 <use href="#..."> 全空
import i18n from '@/locale'
import '@arco-design/web-vue/dist/arco.less'   // 视觉基线
import '@/assets/style/global.less'            // --gpt-* token
import Lab from './App.vue'

FormItem.props.asteriskPosition.default = 'end'
createApp(Lab).use(createPinia()).use(ArcoVue).use(ArcoVueIcon).use(i18n).use(globalComponents).mount('#lab')
```

注意：`DataTable` 通过 `useDashboardTimezone` → `useAppStore` 间接依赖 pinia，**必须装**，否则挂载即报错。

### 3.4 case 清单（这是阶段 0 的真正交付内容）

**表格（4 个）**

| case | 渲染 | 要看什么 |
| --- | --- | --- |
| `table-engines` | `DataTable` 与 `LogsVxeTable` **同一份 columns/data 上下并排** | 行高、字重、单元格内边距、时间戳样式、hover 底色的差异 |
| `table-modes` | `DataTable` 的 `separate` / `merged` / `merged-with-keys` 三态 | 单列模式的合并渲染是否一致 |
| `table-pagination` | `PaginatedDataTable`（footer 分页） vs `TraceTable`（header 分页） vs `LogsVxeTable`（load-more） | 三种分页的位置/尺寸/交互不一致 |
| `table-states` | 空数据 / loading / 超长文本 / 换行开与关 / 紧凑行开与关 | 空态文案与图标、loading 形态 |

**图表（5 个）**

| case | 渲染 | 要看什么 |
| --- | --- | --- |
| `chart-timeseries` | `metrics-chart`（紫板） vs drilldown `Chart`（Grafana 板）**同一份 series** | 配色、轴标签、网格线、tooltip |
| `chart-axis-time` | 同一份数据，分别用 5 种跨度（30m/6h/1d/7d/30d） | 时间轴格式与 tick 密度 |
| `chart-interaction` | `raw-chart` 的 `timeInteraction` vs `count-chart` 的 brush-select | 拖拽/双击/缩放的行为差异 |
| `chart-legend` | `metrics-chart`（solo） vs `data-chart`（默认 toggle） vs `logs-volume`（过滤） | 点图例的三种后果 |
| `chart-empty-loading` | 5 个图表入口的空态/loading 形态 | `graphic` 文字 vs `a-empty` vs 遮罩 |

**状态（3 个）**

| case | 内容 |
| --- | --- |
| `state-toolbars` | 三份表格工具栏（Logs Query / Drilldown / Traces）并排 |
| `state-prefs` | 勾选 / 切换后打印当前 `uiConfig`，直观看清哪个页面读了哪个 key |
| `state-contextmenu` | 同一个 String 列在 DataTable 与 LogsVxeTable 上的右键菜单项并排 |

> 这 12 个 case 同时也是阶段 1/2 的**验收台**：收敛后逐个 case 对比截图，不需要写断言。

### 3.5 配套

- `package.json` 加 `"lab": "vite --config ./config/vite.config.dev.ts"`（和 `dev` 同一条命令，只是提示打开 `/lab.html`；或直接复用 `dev`，不新增脚本）
- `docs/` 里加一页 `lab.md`：怎么开、case 清单、截图约定

### 3.6 验收

- 一条 URL 上能同时看到 `DataTable` 与 `LogsVxeTable` 渲染同一份数据；
- `?case=` 能单独打开任意 case，截图可直接贴进 PR；
- `pnpm build` 后 `dist/` 里**没有** `lab.html`。

### 3.7 它和 Storybook 是什么关系（结论：同一类工具，这里要的是更窄的东西）

**是同一类工具**——都是"脱离业务流程、单独渲染组件"的容器。区别在用途：

| | Storybook | 本方案的 lab |
| --- | --- | --- |
| 定位 | 组件**开发**环境 + 文档站点 | 一致性**对照台** |
| 组织单位 | 参数化 story（args / controls） | 矩阵行（固定 fixture 的 case） |
| 回答的问题 | "这个组件在各种参数下长什么样" | "这 5 个实现并排看，哪里不一样" |
| 需要的东西 | 一套独立构建链 | 复用应用自己的 vite 配置 |

对"一致性审计"这个目的，参数化能力几乎用不上——**需要的是"同一份数据喂给所有实现，然后并排看"**。所以 lab 比 Storybook 更贴合，但这不是拒绝 Storybook 的核心理由，核心理由是下面这两条硬约束。

#### 硬约束：Storybook 会把你钉在 Vite 4 上（版本事实，2026-11 查询 npm registry）

| 包 | 最新版 | Vite peer 要求 | 与当前 Vite `4.5.14` 的兼容性 |
| --- | --- | --- | --- |
| `@storybook/vue3-vite@10.6.7` | 10.6.7 | `^5 \|\| ^6 \|\| ^7 \|\| ^8` | ❌ |
| `@storybook/vue3-vite@9.1.16` | 9.1.16 | `^5 \|\| ^6 \|\| ^7` | ❌ |
| `@storybook/vue3-vite@8.6.14` | 8.6.14 | `^4 \|\| ^5 \|\| ^6` | ✅ 唯一可用 |
| `histoire@1.0.0-beta.1` | beta | `^7.3.0` | ❌ |
| `histoire@0.17.x` | 0.17.15 | `^2.9 \|\| ^3 \|\| ^4 \|\| ^5` | ✅（但 0.17 线已停滞） |

含义：**引入 Storybook = 要么用落后 2 个大版本的 SB8，要么先把整个应用从 Vite 4 升到 5+**。后者会牵动 `@vitejs/plugin-vue@3`、`vite-svg-loader`、全部 `unplugin-*`、以及 `config/vite.config.base.ts` 里 perses 的两个 esbuild 补丁——这是一个独立项目，不该混在"组件一致性"里。

#### 更重要的理由：保真度

lab 的全部价值在于**"看到的就是应用里的样子"**。它直接复用 `config/vite.config.dev.ts`，所以 `css.preprocessorOptions.less.modifyVars`（注入 `arco-theme.less`）、alias、AutoImport、Components 全部自动一致。

Storybook 会引入**第二套配置面**，而其中恰好有几项是"配错了也不会报错、只是长得不一样"：

- Arco 的 `modifyVars`（不复制 → 组件是 Arco 默认主题，颜色全错）
- svg sprite 注入（`@/assets/icons`，不注入 → 所有图标空白，而**空白不会报错**）
- `unplugin-auto-import` / `unplugin-vue-components` 的 `imports` / `dirs`
- perses/react + MUI 的 story glob 排除

任何一项漏掉，都会得到"Storybook 里看着不对、应用里其实是对的"（或反过来），于是这个对照台就失去了意义。

#### 所以：先做 lab，但把 case 写成可移植的

**关键设计约束**：每个 case 是**自包含的 SFC**（`src/lab/cases/table/TableEnginesCase.vue` 这种），只依赖 `fixtures/`，不依赖 lab 的壳（不读 `?case=`、不依赖父级样式、不需要 props）。

这样将来任一时刻想上 Storybook，迁移成本是每个 case 一个 10 行 wrapper：

```ts
// stories/TableEngines.stories.ts（将来）
export default { component: TableEnginesCase, title: 'Tables/Engines' }
export const Default = {}
```

**反过来说**：如果团队已经在别处统一用 Storybook、并且愿意接受"钉在 SB8"或"先升 Vite 5"，那就应该直接上 Storybook——那时把 case 当 story 用，lab 壳可以不要。这个判断取决于团队现状，不取决于技术优劣。

### 3.8 如果真正的诉求是"防回归"：用 Playwright 截图，而不是组件测试

本节回应"大量测试防不住问题"这个痛点。真正能防住"组件被改坏"的自动化手段是**视觉回归**，而仓库里已经有八成基础：

| 已有 | 位置 |
| --- | --- |
| Playwright 1.62.1 | `devDependencies` |
| 固定视口 1720×980 | `playwright.release.config.ts:41` |
| 每路由全页截图 + 挂到测试报告 | `tests/release-smoke/release-smoke.spec.ts:104-111` |
| webServer 自启 + 复用 | `playwright.release.config.ts:45-53` |

缺的只是把 `page.screenshot()`（只存档）换成 `expect(page).toHaveScreenshot()`（会比对基线）。做法：

1. 新增 `playwright.lab.config.ts`：`baseURL` 指向 dev/preview，只跑 `?case=` 单例页。
2. 新增 `tests/lab/lab.spec.ts`：12 个 case → 12 张 `toHaveScreenshot()`。
3. 基线提交进仓库；CI 在**固定 Linux 镜像**里跑（跨平台字体/光栅化差异会导致假红）。

需要注意的坑（决定成败，不是"以后再调"）：

- **ECharts 是 canvas**：同平台同浏览器版本内稳定，跨平台不稳 → 基线必须在 CI 镜像里生成，本地只做 `--update-snapshots` 抽查。
- **字体**：截图前 `await page.evaluate(() => document.fonts.ready)`，否则 Geist 没加载完就是假 diff。
- **动画**：`animation: 'disabled'`（Playwright 截图选项）+ 图表 option 里已有的 `animation: false`。
- **hover / tooltip / popover**：case 里不要留悬停态；需要时单独 case + 显式触发。

这条路的好处：它测的是**像素**，不是实现细节。重构 `DataTable` 内部随便怎么写，只要看起来一样就绿——这正是你想要的"防得住问题"。

代价：首次建基线需要 1 次人工确认（12 张图看一眼），之后每次改动的 diff 需要在 PR 里看图确认。对"改组件库"这种场景，这个成本是合理的。

---

## 4. 0B — 行为契约单（0.5d）

`docs/component-contract.md`，两张表（图表 / 表格），每行一个行为，每列一个"应有行为"。

举例（**当前是分裂的，契约要给出目标值**）：

| 行为 | 目标 | 现状 |
| --- | --- | --- |
| 时间轴标签 | 统一 `formatTimeAxisLabel`（按 tick 间隔自适应） | 3 种实现 |
| 轴 / 网格颜色 | 读 `--gpt-text-label` / `--gpt-border-default` | 2 处硬编码 rgba |
| 系列配色 | 一套语义色板（指标按序、日志按 severity） | 3 套 |
| 拖拽缩放 | 所有时间序列图一致，双击复位 | brush / timeInteraction / 无 |
| 图例点击 | solo（同一语义全局一致） | solo / toggle / 过滤 |
| 行高 | 普通 32px，紧凑 24px | 两套引擎各自定义 |
| 分页 | 页大小可配且持久化 | 3 套 |
| 空态 | 统一 `a-empty` + 统一文案 | 3 种 |
| 右键过滤项 | 按列类型（复用 `filterOpsForType`） | 固定 8 项 |

作用：**把"看出来不一样"升级成"能判定谁对"**。没有这份契约，实验室只能看出差异，定不了方向；阶段 1 的每个 PR 也就没有验收依据。

---

## 5. 0C — 3 个可眼看验证的修复（1d）

| 修复 | 怎么用眼睛验 | 涉及 |
| --- | --- | --- |
| 过滤操作符按列类型 | Traces 页 → 右键 String 列 → 不应出现 `>`；数值列不应出现 `LIKE` | `data-table/index.vue:1426` 改调 `filterOpsForType` |
| 偏好 key 合并 | 实验室 `state-prefs` 勾选 → 切到 SQL 结果页 → 刷新，状态应保持 | `store/modules/app` + `data-view` + `use-logs-table-prefs` |
| 轴色 / 时间轴统一 | 实验室 `chart-timeseries` + `chart-axis-time` 并排，四处应一致 | `prom-chart.ts` / `metrics-chart.vue` / `count-chart` |

每个修复都在实验室里有对应 case，改完刷新即可确认；不需要写测试。

---

## 6. 0D — 只保留 3 个测试（0.5d）

复用**现有** node 环境（`vitest.config.ts` 完全不动，不加 jsdom、不加 `@vue/test-utils`、不加 CI test job）：

| 文件 | 为什么必须用机器 |
| --- | --- |
| `src/utils/chart-time-axis.format-matrix.test.ts` | 7 跨度 × 3 时区 = 21 组合，人工造太慢；且"差一个分支"这种错人眼抓不到 |
| `src/observability/filters.ops-matrix.test.ts` | 10 种 `data_type` × 3 种模式；且要连库才能触发 |
| `src/store/modules/app/table-display-prefs.test.ts` | 旧 `uiConfig` → 新 key 的迁移，只有"带旧数据刷新"才暴露 |

顺带修掉基线唯一的红灯：`src/observability/signal-binding.test.ts`（测试里手写的假 ctx 缺 `setRedMetric`）。它现在让 `pnpm test` 长期是红的，相当于把测试信号静音了——这正是"测试防不住问题"的典型成因。

**明确不做**：组件挂载测试。等阶段 2 真的要拆 `DataTable` 内部（列宽拟合、虚拟滚动）时，再评估要不要针对那一块引入 DOM 测试——那时结论会不一样，因为那是纯计算密集、视觉不可见的逻辑。

---

## 7. 顺带发现：类型检查是坏的（需要单独决定）

```
$ npx vue-tsc --noEmit --skipLibCheck
Search string not found: "/supportedTSExtensions = .*(?=;)/"
```

`vue-tsc@1.8.27` 与解析到的 `typescript@5.9.2` 不兼容（`package.json` 写的是 `^5.0.2` / `^1.0.19`，range 太宽）。影响 `test:check`、`build:test`、`build:staging` 三个脚本。

这不属于阶段 0 范围，但它意味着**目前没有任何自动化的 props 签名护栏**，而阶段 1~3 会大量改 props。两个选项：

- **A（低风险）**：`typescript` 锁到 `~5.4`，vue-tsc 不动 → 先能跑，再补 CI。
- **B（更彻底）**：`vue-tsc` 升 `^2`，TS 保持 5.9 → 可能一次冒出一批历史类型错误。

建议**单独开 PR** 做 A，并同时观察错误数量；如果 A 之后错误可控，再考虑把 `type:check` 加进 CI（这是投入产出最高的一道自动化门禁）。

---

## 8. 排期

| 天 | 内容 | 里程碑 |
| --- | --- | --- |
| D1 | 0A：`lab.html` + main + App + 表格 4 个 case | 能并排看到两张表 |
| D2 上午 | 0A：图表 5 个 + 状态 3 个 case | **M0A**：实验室可用，截图可贴 PR |
| D2 下午 | 0B：行为契约单 | **M0B**：阶段 1 有判定标准 |
| D3 | 0C：3 个修复（边改边在实验室里看） | 三个 P0 肉眼验收通过 |
| D4 上午 | 0D：3 个测试 + 修红灯 | `pnpm test` 全绿，CI 可选择性接入 |
| D4 下午 | 类型检查方案 A 单独 PR | 可选 |

> 如果只有 1 天：**只做 0A 的表格 4 个 case**。它单独就能暴露当前最痛的表格不一致，且是后面一切工作的观察台。

---

## 9. 验收清单

```bash
pnpm dev                                    # 打开 http://localhost:5177/lab.html
#   □ 12 个 case 全部能渲染，无 console error
#   □ ?case=table-engines 可深链、可截图
#   □ 表格 4 个 case 里能一眼指出至少 3 处差异（这就是阶段 1/2 的输入）
#   □ 图表 5 个 case 里能一眼看出配色/轴标签/图例行为的不同

pnpm build && ls dist/*.html                # 预期只有 index.html dashboard.html
pnpm test                                   # 期望全绿（0D 完成后）
```

---

## 10. 与后续阶段的衔接

| 阶段 | 实验室的作用 |
| --- | --- |
| 阶段 1（P0 收敛） | 每个 PR 贴「改前/改后」同 case 截图，代替断言 |
| 阶段 2（表格展示层合一） | 换引擎时逐 case 对比，这是唯一可行的回归手段 |
| 阶段 3（图表入口合一） | `chart-*` 五个 case 即验收台 |

**实验室的长期价值**：它是唯一能在"没有 GreptimeDB 连接"的情况下把组件全部摆出来的地方。以后每次动组件库，先开实验室。
