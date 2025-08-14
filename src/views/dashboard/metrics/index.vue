<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
  )
    a-layout-sider(:width="actualSidebarWidth")
      a-card.metrics-sidebar(:bordered="false")
        MetricSidebar(@copyText="handleCopyText" @insertText="handleInsertText")

  a-layout-content.layout-content
    a-card(:bordered="false")
      .section-title
        a-space
          TimeRangeSelect(
            ref="timeRangeSelectRef"
            v-model:time-length="time"
            v-model:time-range="rangeTime"
            button-type="outline"
            :show-any-time="false"
          )
          a-input(
            v-model="step"
            size="small"
            placeholder="auto"
            style="width: 150px"
            title="Step in seconds. Automatically calculated based on time range for optimal performance (max 500 data points)."
          )
            template(#prepend)
              | Step
            template(#append)
              | S
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
        )

    .section-divider

    // Query Results Section - Chart
    MetricsChart(
      :data="queryResults"
      :loading="queryLoading"
      :query="currentQuery"
      :time-range="currentTimeRange"
      :step="computedStep"
      :chart-type="chartType"
      @update:chart-type="chartType = $event"
    )

    .section-divider(v-if="queryResults && queryResults.length > 0")

    a-card(v-if="queryResults && queryResults.length > 0" :bordered="false")
      .section-title
        | Table View
      .table-section(v-if="queryResults && queryResults.length > 0")
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
  import { useMetrics } from '@/hooks/use-metrics'
  import useTimeRange from '@/hooks/use-time-range'
  import { Message } from '@arco-design/web-vue'
  import { IconLoading, IconPlayArrow } from '@arco-design/web-vue/es/icon'
  import dayjs from 'dayjs'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import MetricSidebar from './components/MetricSidebar.vue'
  import PromQLEditor from './components/PromQLEditor.vue'
  import MetricsChart from './components/MetricsChart.vue'

  // Router for URL sync
  const route = useRoute()
  const router = useRouter()

  // Time range state
  const timeRangeState = useTimeRange({ time: 10 })
  const { rangeTime, time, unixTimeRange } = timeRangeState

  // Use the metrics composable
  const {
    metrics,
    loading,
    error,
    currentQuery,
    queryResult,
    rangeQueryResult,
    fetchMetrics,
    fetchLabelValues,
    executeQuery,
    executeRangeQuery,
    searchMetrics,
  } = useMetrics()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Query state
  const queryLoading = ref(false)
  const queryResults = ref<any[]>([])
  const step = ref() // Step in seconds, not string format
  const currentTimeRange = ref<number[]>([]) // Store current time range for consistency
  const chartType = ref('line') // Chart type state

  // URL sync state
  const hasInitParams = ref(false)

  // Initialize from URL query parameters
  const initializeFromQuery = () => {
    const { promql, timeLength, timeRange: urlTimeRange, step: urlStep, chartType: urlChartType } = route.query

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
      }
    }

    // Time range (absolute time)
    if (urlTimeRange && Array.isArray(urlTimeRange)) {
      rangeTime.value = urlTimeRange as [string, string]
    }

    // Step parameter
    if (urlStep && typeof urlStep === 'string') {
      step.value = parseInt(urlStep, 10)
    }

    // Chart type
    if (urlChartType && typeof urlChartType === 'string') {
      chartType.value = urlChartType
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

    // Step parameter
    if (step.value) {
      query.step = step.value.toString()
    } else {
      delete query.step
    }

    // Chart type
    if (chartType.value && chartType.value !== 'line') {
      query.chartType = chartType.value
    } else {
      delete query.chartType
    }

    router.replace({ query })
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
    if (!queryResults.value || queryResults.value.length === 0) return []

    const rows: any[] = []
    queryResults.value.forEach((series) => {
      const metricName = series.metric?.__name__ || 'unknown'
      const seriesLabels = { ...series.metric }
      delete seriesLabels.__name__

      const labelStr = Object.entries(seriesLabels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ')
      const seriesName = labelStr ? `${metricName}{${labelStr}}` : metricName
      console.log('series', series)
      if (series.values && series.values.length > 0) {
        // Show latest value for each series
        const latestValue = series.values[series.values.length - 1]
        rows.push({
          series: seriesName,
          value: latestValue[1],
        })
      }
    })

    return rows
  })

  // Auto compute step based on time range and max data points (500)
  const computedStep = computed(() => {
    // If step is manually set, use it
    if (step.value) {
      console.log('Using manually set step:', step.value)
      return step.value
    }

    // Auto-calculate step based on currentTimeRange to get max 500 data points
    if (currentTimeRange.value.length === 2) {
      const [start, end] = currentTimeRange.value as [number, number]
      const diffSeconds = end - start

      // Target max 500 data points for good chart performance
      const maxDataPoints = 500
      const targetStepSeconds = Math.ceil(diffSeconds / maxDataPoints)

      console.log('Step calculation:', {
        start: new Date(start * 1000).toISOString(),
        end: new Date(end * 1000).toISOString(),
        diffSeconds,
        maxDataPoints,
        targetStepSeconds,
      })

      // Convert to human-readable step format
      if (targetStepSeconds <= 15) return 15
      if (targetStepSeconds <= 60) return 60
      if (targetStepSeconds <= 300) return 300
      if (targetStepSeconds <= 900) return 900
      if (targetStepSeconds <= 3600) return 3600
      if (targetStepSeconds <= 21600) return 21600
      if (targetStepSeconds <= 86400) return 86400
      if (targetStepSeconds <= 604800) return 604800
      return 86400 // Fallback for very long ranges
    }

    console.log('No time range available, using default step: 15 seconds')
    return 15 // Default fallback
  })

  const promqlEditorRef = ref()
  const timeRangeSelectRef = ref()

  // Query execution
  const handleRunQuery = async () => {
    if (!currentQuery.value.trim()) {
      Message.warning('Please enter a PromQL query')
      return
    }

    queryLoading.value = true
    try {
      // Get time range once and store for consistency
      currentTimeRange.value = unixTimeRange()

      // Use range query for time series data
      const start = currentTimeRange.value[0]
      const end = currentTimeRange.value[1]
      const stepValue = computedStep.value
      if (!start || !end) {
        throw new Error('Invalid time range. Please select a valid time range.')
      }

      console.log('Executing PromQL query:', {
        query: currentQuery.value,
        start,
        end,
        step: stepValue,
      })

      const result = await executeRangeQuery(currentQuery.value, start, end, stepValue)

      if (result && result.result) {
        queryResults.value = result.result
        Message.success(`Query executed successfully - ${result.result.length} series found`)

        // Update URL parameters after successful query
        updateQueryParams()
      } else {
        queryResults.value = []
        Message.info('Query executed but no data returned')
      }
    } catch (err: any) {
      console.error('Query execution failed:', err)
      Message.error(`Query failed: ${err.message || 'Unknown error'}`)
      queryResults.value = []
    } finally {
      queryLoading.value = false
    }
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
  }

  // Initialize
  onMounted(() => {
    // Initialize from URL first
    initializeFromQuery()

    // Fetch initial data
    fetchMetrics()

    // Execute query if we have initial params
    if (hasInitParams.value && currentQuery.value.trim()) {
      nextTick(() => {
        handleRunQuery()
      })
    }
  })
</script>

<style lang="less" scoped>
  :deep(.arco-layout-sider-light) {
    box-shadow: none;
  }
  .new-layout {
    height: 100vh;
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
