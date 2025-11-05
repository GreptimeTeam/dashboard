<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
    :class="hideSidebar ? 'hide-sider' : ''"
  )
    a-layout-sider(style="min-width: 210px" :width="actualSidebarWidth")
      a-card.metrics-sidebar(:bordered="false")
      MetricSidebar(@copyText="handleCopyText" @insertText="handleInsertText")

  a-layout-content.layout-content
    a-card(:bordered="false")
      .query-section
        PromQLEditor(
          ref="promqlEditorRef"
          v-model="currentQuery"
          placeholder="Enter PromQL query"
          :query-loading="queryLoading"
          @query="handleRunQuery"
        )

    .section-divider

    a-card(:bordered="false")
      a-tabs(v-model:active-key="activeTab" type="line")
        a-tab-pane(key="table" title="Table")
          .section-title
            a-space
              TimezoneInstantPicker(
                v-model="instantQueryTime"
                placeholder="Evaluation time"
                allow-clear
                style="width: 200px"
                size="small"
              )

          .table-section
            a-table(
              size="small"
              :data="tableData"
              :loading="queryLoading"
              :pagination="false"
              :scroll="{ x: 800 }"
              :bordered="false"
              :show-header="false"
            )
              template(#columns)
                a-table-column(title="Series" data-index="series" :width="600")
                  template(#cell="{ record }")
                    .series-cell
                      | {{ record.metricName }}{
                      template(v-if="record.labels && record.labels.length > 0")
                        template(v-for="(label, index) in record.labels" :key="index")
                          strong {{ label.key }}
                          | ="{{ label.value }}"
                          span(v-if="index < record.labels.length - 1") ,
                      | }
                a-table-column(title="Values" data-index="values" :width="200")
                  template(#cell="{ record }")
                    .values-cell {{ record.values }}

        a-tab-pane(key="graph" title="Graph")
          MetricsChart
        template(#extra)
          .series-count(v-if="seriesCount > 0") 
            | Result series: {{ seriesCount }} &nbsp;&nbsp; step: {{ currentStep }}s
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick, provide } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useStorage } from '@vueuse/core'
  import { useSeries } from '@/hooks/use-series'
  import TimezoneInstantPicker from '@/components/time-select/instant-picker.vue'
  import { Message } from '@arco-design/web-vue'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import type { MetricsContext } from './types'
  import MetricSidebar from './components/metric-sidebar.vue'
  import PromQLEditor from './components/prom-ql-editor.vue'
  import MetricsChart from './components/metrics-chart.vue'

  const route = useRoute()
  const router = useRouter()
  const seriesHook = useSeries()
  const {
    currentQuery,
    rangeQueryResult,
    instantQueryResult: tableResults,
    executeQuery,
    executeInstantQuery,
    rangeTime,
    time,
    currentStep,
    queryLoading,
    instantQueryTime,
  } = seriesHook

  const sidebarWidth = useStorage('metrics-sidebar-width', 320)
  const activeTab = ref(route.query.tab || 'table')
  const chartType = ref('line')
  const stepSelectionType = ref('medium')
  const hasInitParams = ref(false)

  // Initialize from URL query parameters
  const initializeFromQuery = () => {
    const {
      promql,
      timeLength,
      timeRange: urlTimeRange,
      stepType,
      stepValue,
      chartType: urlChartType,
      tab,
      instantTime,
    } = route.query

    if (promql && typeof promql === 'string') {
      currentQuery.value = decodeURIComponent(promql)
      hasInitParams.value = true
    }

    if (timeLength !== undefined) {
      const length = parseInt(timeLength as string, 10)
      if (!Number.isNaN(length)) {
        time.value = length
        if (rangeTime.value.length > 0) {
          rangeTime.value = []
        }
      }
    }

    if (urlTimeRange && Array.isArray(urlTimeRange)) {
      rangeTime.value = urlTimeRange as [string, string]
      time.value = 0
    }

    if (stepType && typeof stepType === 'string') {
      stepSelectionType.value = stepType
    }

    if (stepValue && typeof stepValue === 'string') {
      currentStep.value = parseInt(stepValue, 10)
    }

    if (urlChartType && typeof urlChartType === 'string') {
      chartType.value = urlChartType
    }

    if (tab && typeof tab === 'string' && ['graph', 'table'].includes(tab)) {
      activeTab.value = tab
    }

    if (instantTime && typeof instantTime === 'string') {
      instantQueryTime.value = instantTime
    }
  }

  // Update URL query parameters
  const updateQueryParams = () => {
    const query = { ...route.query }

    if (currentQuery.value.trim()) {
      query.promql = encodeURIComponent(currentQuery.value)
    } else {
      delete query.promql
    }

    if (rangeTime.value.length === 2) {
      query.timeRange = rangeTime.value
      delete query.timeLength
    } else {
      query.timeLength = time.value.toString()
      delete query.timeRange
    }

    query.stepType = stepSelectionType.value
    query.stepValue = currentStep.value.toString()

    if (chartType.value && chartType.value !== 'line') {
      query.chartType = chartType.value
    } else {
      delete query.chartType
    }

    query.tab = activeTab.value

    if (instantQueryTime.value && activeTab.value === 'table') {
      query.instantTime = instantQueryTime.value as unknown as string
    } else {
      delete query.instantTime
    }

    const prevQuery = { ...route.query }
    delete prevQuery.queryId
    delete query.queryId
    const newQueryWithoutId = { ...query }

    query.queryId = Math.random().toString(36).substring(2, 15)

    const paramsChanged = JSON.stringify(prevQuery) !== JSON.stringify(newQueryWithoutId)

    if (paramsChanged) {
      router.push({ query })
    } else {
      router.replace({ query })
    }
  }

  // Computed properties
  const actualSidebarWidth = computed(() => {
    const minWidth = 100
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  const tableData = computed(() => {
    if (!tableResults.value || tableResults.value.length === 0) return []
    const rows: any[] = []
    tableResults.value.forEach((series) => {
      const metricName = series.metric?.__name__
      const seriesLabels = { ...series.metric }
      delete seriesLabels.__name__

      const labelStr = Object.entries(seriesLabels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ')
      const seriesName = labelStr ? `${metricName}{${labelStr}}` : metricName

      const labels = Object.entries(seriesLabels).map(([key, value]) => ({
        key,
        value,
      }))

      if (series.value !== undefined) {
        let valuesList
        if (Array.isArray(series.value) && series.value.length === 2 && !Array.isArray(series.value[0])) {
          valuesList = series.value[1]
        } else if (Array.isArray(series.value) && Array.isArray(series.value[0])) {
          valuesList = series.value
            .map((valuePoint: [number, string]) => `${valuePoint[0]} @${valuePoint[1]}`)
            .join('\n')
        }

        rows.push({
          series: seriesName,
          metricName,
          labels,
          values: valuesList,
        })
      }
    })

    return rows
  })

  const promqlEditorRef = ref()

  const seriesCount = computed(() => {
    if (activeTab.value === 'graph') {
      return rangeQueryResult.value?.length || 0
    }
    return tableResults.value?.length || 0
  })

  const handleRunQuery = updateQueryParams

  const handleTimeRangeUpdate = (newTimeRange: [number, number]) => {
    time.value = 0
    rangeTime.value = [newTimeRange[0].toString(), newTimeRange[1].toString()]
    updateQueryParams()
  }
  provide<MetricsContext>('metricsContext', {
    ...seriesHook,
    chartType,
    stepSelectionType,
    handleTimeRangeUpdate,
    updateQueryParams,
  })

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      Message.success('Copied to clipboard')
    } catch (err) {
      Message.error('Failed to copy to clipboard')
    }
  }

  const handleInsertText = (text: string) => {
    if (promqlEditorRef.value) {
      promqlEditorRef.value.insertTextAtCursor(text)
    }
  }

  onMounted(() => {
    initializeFromQuery()
    nextTick(() => {
      updateQueryParams()
    })
  })

  watch(activeTab, (newTab) => {
    setTimeout(() => {
      updateQueryParams()
    }, 200)
  })

  watch(
    () => instantQueryTime.value,
    () => {
      updateQueryParams()
    }
  )

  watch(
    () => {
      const { queryId, ...otherParams } = route.query
      return otherParams
    },
    (newParams, oldParams) => {
      if (JSON.stringify(newParams) !== JSON.stringify(oldParams)) {
        initializeFromQuery()
      }
    },
    { deep: true }
  )

  watch(
    () => route.query.queryId,
    (newQueryId) => {
      if (newQueryId && currentQuery.value.trim()) {
        nextTick(async () => {
          if (activeTab.value === 'graph') {
            await executeQuery(currentQuery.value)
          } else if (activeTab.value === 'table') {
            await executeInstantQuery(currentQuery.value)
          }
        })
      }
    }
  )

  const { hideSidebar } = storeToRefs(useAppStore())
</script>

<style lang="less" scoped>
  :deep(.arco-layout-sider-light) {
    box-shadow: none;
  }
  .new-layout {
    height: calc(100vh - 29px);
    background: #fff;
  }

  .metrics-sidebar {
    height: 100%;
    background: var(--color-bg-container);
  }

  .layout-content {
    background: var(--color-bg-container);
    overflow-y: auto;
  }

  .query-layout {
    padding: 0;

    .page-header {
      padding: 16px 24px 8px;
      font-size: 20px;
      font-weight: 600;
      color: var(--color-text-primary);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-container);
    }

    .content-wrapper {
      padding: 16px 24px;
    }

    .query-layout-cards {
      .arco-card {
        margin-bottom: 16px;
        border: 1px solid var(--color-border);
        border-radius: 8px;

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }

  .section-title {
    .arco-space {
      align-items: center;
    }

    .arco-input-wrapper {
      margin-left: 8px;
    }
  }

  .query-section {
    padding: 8px;
  }

  .section-divider {
    height: 6px;
    background: var(--color-neutral-3);
    border: none;
    margin: 0;
    position: relative;
  }
  :deep(.arco-table-th) {
    background-color: #fff;
  }

  .table-controls {
    margin-bottom: 16px;
    border-bottom: 1px solid var(--color-border);

    .arco-space {
      align-items: center;
    }
  }
  :deep(.arco-tabs-content) {
    padding-top: 0;
  }

  .series-count {
    font-size: 12px;
    color: var(--color-text-3);
    font-weight: normal;
    margin-right: 8px;
  }

  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }
  :deep(.arco-tabs-tab-active) {
    color: var(--brand-color);
  }
  :deep(.arco-tabs-nav-ink) {
    background-color: var(--brand-color);
  }
</style>
