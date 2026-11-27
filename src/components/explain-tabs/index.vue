<template lang="pug">
.explain-container
  .explain-toolbar.gpt-results-toolbar
    .view-switch
      a-button-group
        a-button(
          size="small"
          type="outline"
          :title="$t('dashboard.table')"
          :class="{ active: activeView === 'table' }"
          @click="activeView = 'table'"
        )
          svg.icon-16
            use(href="#tableview")
        a-button(
          size="small"
          type="outline"
          :title="$t('dashboard.chart')"
          :class="{ active: activeView === 'chart' }"
          @click="activeView = 'chart'"
        )
          svg.icon-16
            use(href="#chart")
        a-button(
          size="small"
          type="outline"
          :title="$t('dashboard.raw')"
          :class="{ active: activeView === 'raw' }"
          @click="activeView = 'raw'"
        )
          | RAW
    .query-display(v-if="props.data?.query")
      a-tag(v-if="props.data.streaming" size="small" color="arcoblue")
        icon-loading(spin)
        span {{ $t('dashboard.explainLiveRunning') }}
        span(v-if="props.data.executionTime != null") {{ ` · ${props.data.executionTime}ms` }}
      a-popover(
        trigger="click"
        position="bl"
        content-class="code-tooltip"
        :content="props.data.query"
      )
        a-typography-text.query-text(code :ellipsis="{ rows: 1, css: true }") {{ props.data.query }}

    .toolbar-actions(v-if="activeView === 'raw'")
      a-space(:size="8")
        a-button(size="mini" type="outline" @click="exportJson")
          template(#icon)
            icon-download
          | {{ $t('dashboard.download') }}
        TextCopyable(
          type="outline"
          size="mini"
          buttonText
          :data="formattedRawJson"
          :show-data="false"
        )

  ExplainControls(
    v-if="activeView !== 'raw' && stages.length"
    v-model:metrics-expanded="metricsExpanded"
    :view="activeView === 'chart' ? 'chart' : 'table'"
    :stage="activeStageIndex"
    :stage-count="stages.length"
    :nodes="activeStageNodes"
    :metrics="metricOptions"
    :root-plans="activeRootPlans"
    :root-plan="rootPlanFor(activeStageIndex)"
    :selected-nodes="nodesFilterFor(activeStageIndex)"
    :selected-metric="effectiveMetric"
    @update:stage="onStageChange"
    @update:root-plan="selectedRootPlan = $event"
    @update:selected-nodes="selectedNodes = $event"
    @update:selected-metric="selectedMetric = $event"
  )

  .explain-content
    a-empty(v-if="props.data.streaming && !stages.length" :description="$t('dashboard.explainLiveWaiting')")
    .explain-views(v-else)
      .explain-view-pane.explain-stages(
        v-if="mountedViews.includes('table')"
        :class="{ active: activeView === 'table' }"
      )
        ExplainGrid(
          :key="activeStageIndex"
          :data="tableViewStages[activeStageIndex] || []"
          :index="activeStageIndex"
          :root-plan="rootPlanFor(activeStageIndex)"
          :selected-nodes="nodesFilterFor(activeStageIndex)"
          :selected-metric="effectiveMetric"
          :metrics-expanded="metricsExpanded"
        )
      .explain-view-pane.explain-charts(
        v-if="mountedViews.includes('chart')"
        :class="{ active: activeView === 'chart' }"
      )
        template(v-for="(stage, index) in stages" :key="`chart-stage-${index}`")
          .explain-chart-pane(
            v-if="mountedChartStages.includes(index)"
            :class="{ active: activeStageIndex === index }"
          )
            ExplainChart(
              :data="chartStageData[index] || stage"
              :index="index"
              :root-plan="rootPlanFor(index)"
              :selected-nodes="nodesFilterFor(index)"
              :selected-metric="effectiveMetric"
              :metrics-expanded="metricsExpanded"
            )
      .explain-view-pane.explain-raw(v-if="mountedViews.includes('raw')" :class="{ active: activeView === 'raw' }")
        .raw-json-card
          pre.raw-json(v-if="activeView === 'raw'") {{ formattedRawJson }}
</template>

<script lang="ts" setup>
  import { Message } from '@arco-design/web-vue'
  import { useI18n } from 'vue-i18n'
  import fileDownload from 'js-file-download'
  import type { ResultType } from '@/store/modules/code-run/types'
  import ExplainGrid from '@/views/dashboard/modules/explain/explain-grid.vue'
  import ExplainChart from '@/views/dashboard/modules/explain/explain-chart/index.vue'
  import ExplainControls from '@/views/dashboard/modules/explain/explain-controls.vue'
  import {
    formatMetricName,
    getStageMetricKeys,
    getStageNodeIds,
    getStageRootPlanNames,
  } from '@/views/dashboard/modules/explain/utils'
  import TextCopyable from '@/components/text-copyable.vue'

  const { t } = useI18n()

  const props = defineProps<{
    data: ResultType
  }>()

  const activeView = ref<'table' | 'chart' | 'raw'>('table')
  // Prefer DN (stage 1) when present; otherwise stage 0 so Chart always mounts.
  const activeStageIndex = ref(0)
  // Once the user picks a stage, live ticks must not move them back to the default.
  let stagePicked = false
  // Keep visited views mounted so table↔chart switches preserve UI state
  // (metric selection, expand, pan/zoom, scroll) instead of remounting.
  const mountedViews = ref<Array<'table' | 'chart' | 'raw'>>(['table'])
  // Keep each stage chart mounted after first visit so stage switches preserve
  // pan/zoom, highlight, expand, and scroll instead of remounting.
  const mountedChartStages = ref<number[]>([])

  const preferredStageIndex = (stageCount: number) => {
    if (stageCount <= 0) return 0
    return stageCount > 1 ? 1 : 0
  }

  const onStageChange = (index: number) => {
    stagePicked = true
    activeStageIndex.value = index
  }

  // Controls shared by the table and chart views. They are applied to whichever stage is shown.
  const selectedNodes = ref<number[]>([])
  const selectedMetric = ref('')
  const metricsExpanded = ref(false)
  const selectedRootPlan = ref('')

  const resetControls = () => {
    selectedNodes.value = []
    selectedMetric.value = ''
    metricsExpanded.value = false
    selectedRootPlan.value = ''
  }

  const ensureChartStageMounted = (index: number) => {
    if (!mountedChartStages.value.includes(index)) {
      mountedChartStages.value = [...mountedChartStages.value, index]
    }
  }

  const ensureViewMounted = (view: 'table' | 'chart' | 'raw') => {
    if (!mountedViews.value.includes(view)) {
      mountedViews.value = [...mountedViews.value, view]
    }
  }

  // Process stages from explain result data
  const getStages = (result: ResultType) => {
    const { rows } = result.records

    const rowsData = rows.filter((row: any) => row[0] !== null)
    const stagesMap = new Map()
    rowsData.forEach((row: any) => {
      const stageIndex = row[0].toString()

      if (stagesMap.has(stageIndex)) {
        stagesMap.set(stageIndex, [...stagesMap.get(stageIndex), row])
      } else {
        stagesMap.set(stageIndex, [row])
      }
    })
    return Array.from(stagesMap.values())
  }

  const stages = computed(() => {
    if (!props.data) return []
    return getStages(props.data)
  })

  const activeStageRows = computed(() => stages.value[activeStageIndex.value] ?? [])
  const activeStageNodes = computed(() => getStageNodeIds(activeStageRows.value))
  const stageNodesByStage = computed(() => stages.value.map((rows) => getStageNodeIds(rows)))
  const rootPlansByStage = computed(() => stages.value.map((rows) => getStageRootPlanNames(rows)))
  const activeRootPlans = computed(() => rootPlansByStage.value[activeStageIndex.value] ?? [])

  const metricOptions = computed(() =>
    getStageMetricKeys(activeStageRows.value).map((key) => ({ value: key, label: formatMetricName(key) }))
  )
  // The kept selection may not exist in the stage being shown; treat that as "no metric selected".
  const effectiveMetric = computed(() =>
    metricOptions.value.some((metric) => metric.value === selectedMetric.value) ? selectedMetric.value : ''
  )

  // A node filter chosen on one stage only narrows the stages that have those nodes.
  const nodesFilterFor = (stageIndex: number) => {
    const stageNodes = stageNodesByStage.value[stageIndex] ?? []
    return selectedNodes.value.filter((node) => stageNodes.includes(node))
  }

  // Only stages with several root plans need a root filter; default to the first one.
  const rootPlanFor = (stageIndex: number) => {
    const roots = rootPlansByStage.value[stageIndex] ?? []
    if (roots.length <= 1) return ''
    return roots.includes(selectedRootPlan.value) ? selectedRootPlan.value : roots[0]
  }

  // Live ticks must only refresh the visible view/stage. Components stay mounted
  // (so their selection/zoom state survives), but inactive panes keep their last
  // data until they become visible again.
  const tableViewStages = shallowRef<any[][]>([])
  const chartStageData = shallowRef<Record<number, any[][]>>({})

  watch(
    [stages, activeView],
    ([nextStages, view]) => {
      if (view === 'table') tableViewStages.value = nextStages
    },
    { immediate: true }
  )

  watch(
    [stages, activeView, activeStageIndex],
    ([nextStages, view, stageIndex]) => {
      if (view !== 'chart') return
      chartStageData.value = {
        ...chartStageData.value,
        [stageIndex]: nextStages[stageIndex] ?? [],
      }
    },
    { immediate: true }
  )

  const reconstructExplainJson = (result: ResultType) => {
    return {
      output: [
        {
          records: result.records,
        },
      ],
      execution_time_ms: result.executionTime,
      streaming: result.streaming || undefined,
    }
  }

  const formattedRawJson = computed(() => {
    try {
      return JSON.stringify(reconstructExplainJson(props.data), null, 2)
    } catch (e) {
      return t('explain.formatError')
    }
  })

  const exportJson = () => {
    try {
      const jsonData = JSON.stringify(reconstructExplainJson(props.data), null, 2)
      fileDownload(jsonData, 'explain-analyze-greptimedb.json', 'application/json')
      Message.success(t('explain.downloaded'))
    } catch (e) {
      Message.error(t('explain.exportFailed', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  // Only reset view when switching to a different explain result tab, not on live metrics ticks
  watch(
    () => props.data?.key,
    () => {
      stagePicked = false
      resetControls()
      activeStageIndex.value = preferredStageIndex(stages.value.length)
      activeView.value = 'table'
      mountedViews.value = ['table']
      mountedChartStages.value = []
      tableViewStages.value = stages.value
      chartStageData.value = {}
    }
  )

  // Clamp / prefer DN once stages arrive (stream may fill rows after the tab mounts).
  // `immediate` also applies the preference to static results (e.g. imported JSON).
  watch(
    () => stages.value.length,
    (count) => {
      if (count <= 0) return
      if (!stagePicked || activeStageIndex.value >= count) {
        activeStageIndex.value = preferredStageIndex(count)
      }
    },
    { immediate: true }
  )

  watch(
    activeView,
    (view) => {
      ensureViewMounted(view)
      if (view === 'chart') {
        ensureChartStageMounted(activeStageIndex.value)
      }
    },
    { immediate: true }
  )

  watch(activeStageIndex, (index) => {
    if (activeView.value === 'chart') {
      ensureChartStageMounted(index)
    }
  })
</script>

<style lang="less" scoped>
  .explain-container {
    --color-text-2: var(--gpt-text-primary);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;

    :deep(.arco-icon),
    :deep(.arco-btn-icon .arco-icon) {
      color: var(--gpt-text-primary);
      stroke: currentColor;
    }

    .view-switch :deep(.arco-btn-group .arco-btn-outline:not(.active)) {
      color: var(--gpt-text-primary);

      &:hover {
        color: var(--gpt-control-accent-hover);
      }
    }
  }

  .explain-toolbar.gpt-results-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--gpt-border-default);
    gap: var(--gpt-gap-md);

    .toolbar-actions {
      flex-shrink: 0;
    }

    .query-display {
      flex: 1;
      margin-right: 6px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;

      :deep(.arco-tag) {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      :deep(.arco-typography.query-text) {
        margin: 0;
        white-space: nowrap;

        code {
          color: var(--gpt-brand-700);
          background: transparent;
          border-radius: 0;
          padding: var(--gpt-gap-xs) var(--gpt-gap-md);
          font-size: var(--gpt-font-sm);
          font-family: var(--font-mono);
        }
      }
    }
  }

  .explain-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    // No border here: each view's content (stage cards, chart, raw card) draws its own,
    // otherwise table mode shows the container border around the stage card borders.
    margin: var(--gpt-page-padding-y) var(--gpt-page-padding-x);

    > :first-child {
      height: 100%;
      overflow: auto;
    }

    .explain-views {
      position: relative;
      height: 100%;
      overflow: hidden;
    }

    .explain-view-pane {
      position: absolute;
      inset: 0;
      visibility: hidden;
      pointer-events: none;
      z-index: 0;

      &.active {
        visibility: visible;
        pointer-events: auto;
        z-index: 1;
      }
    }

    .explain-stages {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: var(--gpt-gap-md);
      overflow: hidden;

      :deep(.explain-grid) {
        flex: 1 1 0;
        height: 100%;
      }
    }

    .explain-charts {
      overflow: hidden;
    }

    .explain-chart-pane {
      position: absolute;
      inset: 0;
      visibility: hidden;
      pointer-events: none;
      z-index: 0;

      &.active {
        // Follow the parent view pane: an explicit `visible` would override the hidden
        // `.explain-view-pane` and keep the active chart painted under the table view.
        visibility: inherit;
        pointer-events: inherit;
        z-index: 1;
      }
    }
  }

  .raw-json-card {
    box-sizing: border-box;
    height: 100%;
    padding: var(--gpt-toolbar-padding);
    overflow: auto;
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: var(--gpt-shadow-sm);

    .raw-json {
      font-size: var(--gpt-font-base);
      color: var(--gpt-text-primary);
      margin: 0;
      white-space: pre-wrap;
    }
  }
</style>
