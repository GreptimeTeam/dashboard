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
        PromQLEditor(ref="promqlEditorRef" v-model="currentQuery")

      // Query Results Section
      a-card(v-if="queryResults && queryResults.length > 0" :bordered="false")
        template(#title)
          a-space
            span.results-header
              span Query Results
              span.results-count(v-if="queryResults.length > 0") 
                | ({{ queryResults.length }} {{ queryResults.length === 1 ? 'series' : 'series' }})
            a-button(type="text" size="small" @click="clearResults")
              template(#icon)
                svg.icon
                  use(href="#delete")
              | Clear

        .results-section
          a-table(
            size="small"
            :columns="tableColumns"
            :data="queryResults"
            :loading="queryLoading"
            :pagination="pagination"
            :scroll="{ x: 800 }"
          )
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { useMetrics } from '@/hooks/use-metrics'
  import { Message } from '@arco-design/web-vue'
  import { IconLoading, IconPlayArrow } from '@arco-design/web-vue/es/icon'
  import dayjs from 'dayjs'
  import TimeRangeSelect from '@/components/time-range-select/index.vue'
  import MetricSidebar from './components/MetricSidebar.vue'
  import PromQLEditor from './components/PromQLEditor.vue'

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

  // Table configuration
  const tableColumns = computed(() => [
    {
      title: 'Metric',
      dataIndex: 'metric',
      key: 'metric',
      width: 200,
      render: ({ record }: any) => record.metric?.__name__ || 'Unknown',
    },
    {
      title: 'Labels',
      dataIndex: 'labels',
      key: 'labels',
      width: 300,
      render: ({ record }: any) => {
        const metricLabels = { ...record.metric }
        delete metricLabels.__name__
        return Object.entries(metricLabels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(', ')
      },
    },
    {
      title: 'Values',
      dataIndex: 'values',
      key: 'values',
      render: ({ record }: any) => {
        if (record.values && record.values.length > 0) {
          return `${record.values.length} data points`
        }
        if (record.value) {
          return `${record.value[1]} at ${dayjs.unix(record.value[0]).format('HH:mm:ss')}`
        }
        return 'No data'
      },
    },
  ])

  const pagination = computed(() => ({
    current: 1,
    pageSize: 50,
    total: queryResults.value.length,
    showTotal: true,
    showPageSize: true,
    pageSizeOptions: ['20', '50', '100', '200'],
  }))

  // Computed properties
  const actualSidebarWidth = computed(() => {
    const minWidth = 100
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
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
    fetchMetrics()
  })
</script>

<style lang="less" scoped>
  .new-layout {
    height: 100vh;
    background: var(--color-bg-container);
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
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-container);

    .arco-space {
      align-items: center;
    }

    .arco-input-wrapper {
      margin-left: 8px;
    }
  }

  .query-section {
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .results-section {
    .results-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;

      .results-count {
        color: var(--color-text-secondary);
        font-weight: normal;
        font-size: 12px;
      }
    }

    .arco-table-container {
      border-radius: 0;
    }
  }

  // Import query layout styles
  @import '@/assets/style/query-layout.less';
</style>
