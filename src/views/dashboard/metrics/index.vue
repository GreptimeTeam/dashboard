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
      .section-title
        a-space
          TimeRangeSelect(
            v-model:time-length="time"
            v-model:time-range="rangeTime"
            button-type="outline"
            :show-any-time="false"
          )
          StepSelector(
            v-model:selection-type="stepSelectionType"
            v-model:step-value="currentStep"
            :unix-time-range="unixTimeRange"
          )

          a-tooltip(content="Ctrl + Enter" position="right")
            a-button(
              type="primary"
              size="small"
              :loading="queryLoading"
              @click="handleRunQuery"
            )
              template(#icon)
                icon-loading(v-if="queryLoading" spin)
                icon-play-arrow(v-else)
              | Run Query

      .query-section
        PromQLEditor(
          ref="promqlEditorRef"
          v-model="currentQuery"
          style="height: 100px"
          placeholder="Enter PromQL query"
          @query="handleRunQuery"
        )

    .section-divider

    // Query Results Section - Chart
    MetricsChart(
      :key="currentQuery + queryStep"
      :data="queryResults"
      :loading="queryLoading"
      :query="currentQuery"
      :step="queryStep"
      :chart-type="chartType"
      :time-range="currentTimeRange"
      @update:chart-type="chartType = $event"
      @time-range-update="handleTimeRangeUpdate"
    )

    .section-divider(v-if="queryResults && queryResults.length > 0")

    a-card(v-if="tableResults && tableResults.length > 0" :bordered="false")
      .section-title
        | Table View
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
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { useRoute, useRouter } from 'vue-router'
  import { useSeries } from '@/hooks/use-series'
  import { Message } from '@arco-design/web-vue'
  import { IconLoading, IconPlayArrow } from '@arco-design/web-vue/es/icon'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import MetricSidebar from './components/metric-sidebar.vue'
  import PromQLEditor from './components/prom-ql-editor.vue'
  import MetricsChart from './components/metrics-chart.vue'
  import StepSelector from './components/step-selector.vue'

  // Router for URL sync
  const route = useRoute()
  const router = useRouter()

  // Use the series composable with integrated time range and step calculation
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
  } = useSeries()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Query state

  const chartType = ref('line') // Chart type state

  // Step selector state
  const stepSelectionType = ref('medium') // Selection type: low/medium/high/fixed/custom
  // URL sync state
  const hasInitParams = ref(false)
  // Track if we're currently updating query params to prevent double execution
  const isUpdatingQueryParams = ref(false)

  // Initialize from URL query parameters
  const initializeFromQuery = () => {
    const { promql, timeLength, timeRange: urlTimeRange, stepType, stepValue, chartType: urlChartType } = route.query

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
  }

  // Update URL query parameters
  const updateQueryParams = () => {
    isUpdatingQueryParams.value = true

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
    // query.queryid = Math.random().toString(36).substring(2, 15)

    router.push({ query }).finally(() => {
      // Reset the flag after router update completes
      isUpdatingQueryParams.value = false
    })
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

  // Query execution - now much simpler with reactive hook
  const handleRunQuery = async () => {
    updateQueryParams()
    nextTick(async () => {
      // Execute range query for chart
      await executeQuery(currentQuery.value)
      // Execute instant query for table
      if (currentQuery.value.trim()) {
        await executeInstantQuery(currentQuery.value)
      }
    })
  }

  // Handle time range update from chart selection
  const handleTimeRangeUpdate = (newTimeRange: [number, number]) => {
    // Switch to custom time range mode and update the time range
    time.value = 0 // Switch to custom mode
    rangeTime.value = [newTimeRange[0].toString(), newTimeRange[1].toString()]
    // Execute new query with updated time range
    handleRunQuery()
  }

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
  } // Watch for router query changes and auto-execute query if promql is present
  watch(
    () => [route.query.promql, route.query.timeRange, route.query.timeLength, route.query.queryid],
    (newVal) => {
      // Skip if we're currently updating query params ourselves
      if (isUpdatingQueryParams.value) return

      initializeFromQuery()
      if (currentQuery.value) {
        nextTick(async () => {
          // Execute range query for chart
          await executeQuery(currentQuery.value)
          // Execute instant query for table
          await executeInstantQuery(currentQuery.value)
        })
      }
    },
    { immediate: true }
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
</style>
