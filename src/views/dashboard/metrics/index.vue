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

    // Results tabs section
    a-card(:bordered="false")
      a-tabs(v-model:active-key="activeTab" type="line")
        a-tab-pane(key="graph" title="Graph")
          MetricsChart

        a-tab-pane(key="table" title="Table")
          .section-title
            a-space
              a-date-picker(
                v-model="instantQueryTime"
                show-time
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="Evaluation time"
                allow-clear
                style="width: 200px"
                size="small"
                @change="handleInstantQueryTimeChange"
              )

          .table-section(v-if="tableResults && tableResults.length > 0")
            a-table(
              size="small"
              :columns="tableColumns"
              :data="tableData"
              :loading="queryLoading"
              :pagination="false"
              :scroll="{ x: 800 }"
              :bordered="false"
            )
          .empty-state(v-else)
            a-empty(description="No data to display")
              template(#image)
                icon-exclamation-circle-fill
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick, provide } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useStorage } from '@vueuse/core'
  import { useSeries } from '@/hooks/use-series'
  import { Message } from '@arco-design/web-vue'
  import { IconExclamationCircleFill } from '@arco-design/web-vue/es/icon'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import MetricSidebar from './components/metric-sidebar.vue'
  import PromQLEditor from './components/prom-ql-editor.vue'
  import MetricsChart from './components/metrics-chart.vue'

  // Router for URL sync
  const route = useRoute()
  const router = useRouter()

  // Use the series composable with integrated time range and step calculation
  const seriesHook = useSeries()
  const {
    currentQuery,
    rangeQueryResult: queryResults,
    instantQueryResult: tableResults,
    executeQuery,
    executeInstantQuery,
    // Time range state
    rangeTime,
    time,
    unixTimeRange,
    queryStep,
    currentTimeRange,
    currentStep,
    queryLoading,
    instantQueryTime,
  } = seriesHook

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Tab state
  const activeTab = ref(route.query.tab || 'table')

  // Query state
  const chartType = ref('line') // Chart type state

  // Step selector state
  const stepSelectionType = ref('medium') // Selection type: low/medium/high/fixed/custom

  // URL sync state
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

    // PromQL query
    if (promql && typeof promql === 'string') {
      currentQuery.value = decodeURIComponent(promql)
      hasInitParams.value = true
    }

    // Time length (relative time)
    if (timeLength !== undefined) {
      const length = parseInt(timeLength as string, 10)
      if (!Number.isNaN(length)) {
        time.value = length
        rangeTime.value = []
      }
    }

    // Time range (absolute time)
    if (urlTimeRange && Array.isArray(urlTimeRange)) {
      rangeTime.value = urlTimeRange as [string, string]
      time.value = 0
    }

    // Step parameter
    if (stepType && typeof stepType === 'string') {
      stepSelectionType.value = stepType
    }

    if (stepValue && typeof stepValue === 'string') {
      currentStep.value = parseInt(stepValue, 10)
    }

    // Chart type
    if (urlChartType && typeof urlChartType === 'string') {
      chartType.value = urlChartType
    }

    // Active tab - sync from URL, default to 'graph'
    if (tab && typeof tab === 'string' && ['graph', 'table'].includes(tab)) {
      activeTab.value = tab
    } else {
      activeTab.value = 'graph'
    }

    // Instant query time
    if (instantTime && typeof instantTime === 'string') {
      try {
        const parsedTime = new Date(instantTime)
        if (!Number.isNaN(parsedTime.getTime())) {
          instantQueryTime.value = parsedTime
        }
      } catch (e) {
        // Invalid date, ignore
      }
    }
  }

  // Update URL query parameters
  const updateQueryParams = () => {
    const query = { ...route.query }

    // PromQL query
    if (currentQuery.value.trim()) {
      query.promql = encodeURIComponent(currentQuery.value)
    } else {
      delete query.promql
    }

    // Time selection
    if (rangeTime.value.length === 2) {
      query.timeRange = rangeTime.value
      delete query.timeLength
    } else {
      query.timeLength = time.value.toString()
      delete query.timeRange
    }

    query.stepType = stepSelectionType.value
    query.stepValue = currentStep.value.toString()

    // Chart type
    if (chartType.value && chartType.value !== 'line') {
      query.chartType = chartType.value
    } else {
      delete query.chartType
    }

    query.tab = activeTab.value

    // Instant query time (for table tab)
    if (instantQueryTime.value && activeTab.value === 'table') {
      query.instantTime = instantQueryTime.value.toISOString()
    } else {
      delete query.instantTime
    }
    // query.queryid = Math.random().toString(36).substring(2, 15)

    router.push({ query })
  }

  // Computed properties
  const actualSidebarWidth = computed(() => {
    const minWidth = 100
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  // Table configuration
  const tableColumns = computed(() => [
    {
      title: 'Series',
      dataIndex: 'series',
      key: 'series',
      width: 300,
      ellipsis: true,
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 120,
      align: 'right' as const,
    },
  ])

  const tableData = computed(() => {
    if (!tableResults.value || tableResults.value.length === 0) return []
    const rows: any[] = []
    tableResults.value.forEach((series) => {
      const metricName = series.metric?.__name__ || 'unknown'
      const seriesLabels = { ...series.metric }
      delete seriesLabels.__name__

      const labelStr = Object.entries(seriesLabels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ')
      const seriesName = labelStr ? `${metricName}{${labelStr}}` : metricName

      // Instant query returns single value, not array of values
      if (series.value !== undefined) {
        rows.push({
          series: seriesName,
          value: series.value[1],
        })
      }
    })

    return rows
  })

  const promqlEditorRef = ref()

  // Unified query trigger - only updates URL parameters
  const triggerQuery = () => {
    // Add unique queryId to trigger execution
    const currentParams = { ...route.query }
    currentParams.queryId = Math.random().toString(36).substring(2, 15)
    router.replace({ query: currentParams })
  }
  const handleQuery = () => {
    updateQueryParams()
    triggerQuery()
  }

  // Legacy handlers that now just trigger through URL
  const handleChartQuery = handleQuery
  const handleTableQuery = handleQuery
  const handleRunQuery = handleQuery

  // Handle time range update from chart selection
  const handleTimeRangeUpdate = (newTimeRange: [number, number]) => {
    // Switch to custom time range mode and update the time range
    time.value = 0 // Switch to custom mode
    rangeTime.value = [newTimeRange[0].toString(), newTimeRange[1].toString()]
    // Trigger query through URL update
    updateQueryParams()
    triggerQuery()
  }

  // Provide the context to child components
  provide('metricsContext', {
    // Series hook data and methods
    ...seriesHook,
    // Additional shared state and methods
    chartType,
    stepSelectionType,
    handleTimeRangeUpdate,
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

  // Handle instant query time change
  const handleInstantQueryTimeChange = (date: Date) => {
    instantQueryTime.value = date
    // Auto-trigger query when time changes if there's a query and we're on table tab
    if (currentQuery.value.trim() && activeTab.value === 'table') {
      triggerQuery()
    }
  }

  // Initialize from query parameters only once on mount
  onMounted(() => {
    initializeFromQuery()
    nextTick(() => {
      triggerQuery()
    })
  })

  watch(activeTab, (newTab) => {
    updateQueryParams()
    setTimeout(() => {
      triggerQuery()
    }, 1)
  })

  // Watch only queryId to execute queries
  watch(
    () => route.query.queryId,
    (newQueryId) => {
      // Only execute if we have a queryId and a query
      if (newQueryId && currentQuery.value.trim()) {
        nextTick(async () => {
          // Execute appropriate query based on active tab
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
  .table-section {
    margin-top: 16px;
  }

  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }
</style>
