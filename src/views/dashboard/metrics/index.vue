<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
  )
    a-layout-sider(:width="actualSidebarWidth")
      a-card.metrics-sidebar(:bordered="false")
        template(#title)
          a-space(:size="10")
            | Metrics Explorer
            a-button(
              type="outline"
              size="small"
              :loading="loading"
              @click="refreshData"
            )
              template(#icon)
                svg.icon.brand-color
                  use(href="#refresh")

        MetricSidebar(@copyText="handleCopyText" @insertText="handleInsertText")

  a-layout-content.layout-content
    a-card(:bordered="false")
      .toolbar
        a-space
          TimeRangeSelect(
            ref="timeRangeSelectRef"
            v-model:time-length="time"
            v-model:time-range="rangeTime"
            button-type="outline"
          )
          a-input(
            v-model="step"
            size="small"
            placeholder="Step (e.g. 15s)"
            style="width: 120px"
            :disabled="autoStep"
          )
            template(#prepend)
              | Step
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
        PromQLEditor(ref="promqlEditorRef" v-model="currentQuery" style="height: 100px")

    .section-divider

    // Query Results Section - Chart
    MetricsChart(:data="queryResults" :loading="queryLoading" :query="currentQuery")

    .section-divider(v-if="queryResults && queryResults.length > 0")

    a-card(v-if="queryResults && queryResults.length > 0" :bordered="false")
      .toolbar
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

  // Use the metrics composable
  const {
    metrics,
    labels,
    loading,
    error,
    currentQuery,
    queryResult,
    rangeQueryResult,
    timeRange,
    fetchMetrics,
    fetchLabels,
    fetchLabelValues,
    executeQuery,
    executeRangeQuery,
    clearResults,
    updateTimeRange,
    searchMetrics,
  } = useMetrics()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Time range state
  const time = ref(15) // minutes
  const rangeTime = ref<[string, string]>([
    dayjs().subtract(15, 'minute').format('YYYY-MM-DD HH:mm:ss'),
    dayjs().format('YYYY-MM-DD HH:mm:ss'),
  ])

  // Query state
  const queryLoading = ref(false)
  const queryResults = ref<any[]>([])
  const step = ref('15s')
  const autoStep = ref(true)

  // URL sync state
  const hasInitParams = ref(false)

  // Initialize from URL query parameters
  const initializeFromQuery = () => {
    const { promql, timeLength, timeRange: urlTimeRange, step: urlStep, autoStep: urlAutoStep } = route.query

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
      step.value = urlStep
      autoStep.value = false
    }

    // Auto step setting
    if (urlAutoStep !== undefined) {
      autoStep.value = urlAutoStep === 'true'
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
    if (!autoStep.value && step.value) {
      query.step = step.value
    } else {
      delete query.step
    }

    // Auto step setting
    query.autoStep = autoStep.value.toString()

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
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
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

      if (series.values && series.values.length > 0) {
        // Show latest value for each series
        const latestValue = series.values[series.values.length - 1]
        rows.push({
          series: seriesName,
          value: parseFloat(latestValue[1]).toFixed(4),
          timestamp: dayjs.unix(latestValue[0]).format('YYYY-MM-DD HH:mm:ss'),
        })
      } else if (series.value) {
        // Instant query result
        rows.push({
          series: seriesName,
          value: parseFloat(series.value[1]).toFixed(4),
          timestamp: dayjs.unix(series.value[0]).format('YYYY-MM-DD HH:mm:ss'),
        })
      }
    })

    return rows
  })

  // Auto compute step based on time range
  const computedStep = computed(() => {
    if (!autoStep.value) return step.value

    const diffMinutes = time.value
    if (diffMinutes <= 5) return '15s'
    if (diffMinutes <= 15) return '30s'
    if (diffMinutes <= 60) return '1m'
    if (diffMinutes <= 360) return '5m'
    if (diffMinutes <= 1440) return '15m'
    return '1h'
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
      // Use range query for time series data
      const start = dayjs(rangeTime.value[0]).unix()
      const end = dayjs(rangeTime.value[1]).unix()
      const stepValue = computedStep.value

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

  // Refresh data
  const refreshData = async () => {
    await fetchMetrics()
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

  // Watch for time range changes
  watch([time, rangeTime], () => {
    if (autoStep.value) {
      // Trigger reactivity for computed step
      step.value = computedStep.value
    }
  })

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

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-container);
    height: 50px;

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
    height: 4px;
    background: var(--color-neutral-3);
    border: none;
    margin: 0;
    position: relative;
  }
  :deep(.arco-table-th) {
    background-color: #fff;
  }
</style>
