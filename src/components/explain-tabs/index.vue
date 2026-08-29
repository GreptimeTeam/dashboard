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

  .explain-content
    a-empty(v-if="props.data.streaming && !stages.length" :description="$t('dashboard.explainLiveWaiting')")
    .explain-views(v-else)
      .explain-view-pane.explain-stages(
        v-if="mountedViews.includes('table')"
        :class="{ active: activeView === 'table' }"
      )
        ExplainGrid(
          v-for="(stage, index) in stages"
          :key="index"
          :data="stage"
          :index="index"
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
              :data="stage"
              :index="index"
              :active-stage-index="activeStageIndex"
              :total-stages="stages.length"
              @change-stage="activeStageIndex = $event"
            )
      .explain-view-pane.raw-json-card(v-if="mountedViews.includes('raw')" :class="{ active: activeView === 'raw' }")
        pre.raw-json {{ formattedRawJson }}
</template>

<script lang="ts" setup>
  import { Message } from '@arco-design/web-vue'
  import fileDownload from 'js-file-download'
  import type { ResultType } from '@/store/modules/code-run/types'
  import ExplainGrid from '@/views/dashboard/modules/explain/explain-grid.vue'
  import ExplainChart from '@/views/dashboard/modules/explain/explain-chart/index.vue'
  import TextCopyable from '@/components/text-copyable.vue'

  const props = defineProps<{
    data: ResultType
  }>()

  const activeView = ref<'table' | 'chart' | 'raw'>('table')
  // Prefer DN (stage 1) when present; otherwise stage 0 so Chart always mounts.
  const activeStageIndex = ref(0)
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
      return 'Error formatting JSON data'
    }
  })

  const exportJson = () => {
    try {
      const jsonData = JSON.stringify(reconstructExplainJson(props.data), null, 2)
      fileDownload(jsonData, 'explain-analyze-greptimedb.json', 'application/json')
      Message.success('JSON downloaded successfully')
    } catch (e) {
      Message.error(`Failed to export JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Only reset view when switching to a different explain result tab, not on live metrics ticks
  watch(
    () => props.data?.key,
    () => {
      activeStageIndex.value = preferredStageIndex(stages.value.length)
      activeView.value = 'table'
      mountedViews.value = ['table']
      mountedChartStages.value = []
    }
  )

  // Clamp / prefer DN once stages arrive (stream may fill rows after the tab mounts).
  watch(
    () => stages.value.length,
    (count, prev) => {
      if (count <= 0) return
      if (activeStageIndex.value >= count || prev === 0) {
        activeStageIndex.value = preferredStageIndex(count)
      }
    }
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
    margin: var(--gpt-page-padding-y) var(--gpt-page-padding-x);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: var(--gpt-shadow-sm);

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
      padding: var(--gpt-gap-md);
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
        visibility: visible;
        pointer-events: auto;
        z-index: 1;
      }
    }
  }

  .raw-json-card {
    height: 100%;
    padding: var(--gpt-toolbar-padding);
    overflow: auto;
    background: var(--gpt-bg-panel);

    .raw-json {
      font-size: var(--gpt-font-base);
      color: var(--gpt-text-primary);
      margin: 0;
      white-space: pre-wrap;
    }
  }
</style>
