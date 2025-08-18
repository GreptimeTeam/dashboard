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
              | s
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
      :key="chartKey"
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
  const { currentQuery, rangeQueryResult: queryResults, fetchMetrics, executeRangeQuery } = useMetrics()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Query state
  const queryLoading = ref(false)

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

  // Step calculation using exact Prometheus UI logic
  const computedStep = computed(() => {
    // If step is manually set, use it
    if (step.value) {
      console.log('Using manually set step:', step.value)
      return step.value
    }

    // Auto-calculate step using Prometheus UI's exact logic
    if (currentTimeRange.value.length === 2) {
      const [start, end] = currentTimeRange.value as [number, number]
      const diffSeconds = end - start

      // Prometheus UI logic: range / 250000 for ~250 data points
      // Since we're working in seconds, we need to adjust the divisor: 250000/1000 = 250
      const targetStepSeconds = Math.max(Math.floor(diffSeconds / 250), 1)

      console.log('Prometheus UI step calculation:', {
        start: new Date(start * 1000).toISOString(),
        end: new Date(end * 1000).toISOString(),
        diffSeconds,
        targetStepSeconds,
        expectedDataPoints: Math.floor(diffSeconds / targetStepSeconds),
        prometheusLogic: `${diffSeconds}s / 250 = ${diffSeconds / 250} → Math.floor(${
          diffSeconds / 250
        }) = ${Math.floor(diffSeconds / 250)} → Math.max(${Math.floor(diffSeconds / 250)}, 1) = ${targetStepSeconds}`,
      })

      return targetStepSeconds
    }

    console.log('No time range available, using default step: 1 second (Prometheus UI default)')
    return 1 // Prometheus UI default when no range
  })

  const promqlEditorRef = ref()

  // Track previous query for time alignment
  const previousQuery = ref('')
  const previousTimeRange = ref<number[]>([])

  // Force chart recreation when query changes
  const chartKey = ref(0)

  // Query execution
  const handleRunQuery = async () => {
    if (!currentQuery.value.trim()) {
      Message.warning('Please enter a PromQL query')
      return
    }

    // Get time range once and store for consistency
    const newTimeRange = unixTimeRange()
    const stepValue = computedStep.value

    // Check if this is the same PromQL query
    const isSameQuery = previousQuery.value === currentQuery.value

    if (isSameQuery && previousTimeRange.value.length === 2) {
      // Same query: ensure time difference is integer multiple of step
      const [prevStart, prevEnd] = previousTimeRange.value
      const [newStart, newEnd] = newTimeRange

      // Calculate time difference
      const timeDiff = newEnd - prevEnd

      // Ensure time difference is integer multiple of step
      const alignedTimeDiff = Math.round(timeDiff / stepValue) * stepValue
      const alignedNewEnd = prevEnd + alignedTimeDiff
      const alignedNewStart = alignedNewEnd - (newEnd - newStart)

      console.log('Same query detected, aligning time:', {
        prevEnd,
        newEnd,
        timeDiff,
        stepValue,
        alignedTimeDiff,
        alignedNewEnd,
        alignedNewStart,
      })

      // Use aligned time range
      currentTimeRange.value = [alignedNewStart, alignedNewEnd]
    } else {
      // Different query or first query: use original time range
      currentTimeRange.value = newTimeRange
      console.log('Different query or first query, using original time range')

      // Force chart recreation for different query
      chartKey.value += 1
      console.log('Chart key incremented for different query:', chartKey.value)
    }

    // Store current query and time range for next comparison
    previousQuery.value = currentQuery.value
    previousTimeRange.value = [...currentTimeRange.value]

    // Use range query for time series data
    const start = currentTimeRange.value[0]
    const end = currentTimeRange.value[1]

    executeRangeQuery(currentQuery.value, start, end, stepValue).then(() => {
      updateQueryParams()
    })
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
