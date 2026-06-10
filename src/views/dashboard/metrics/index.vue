<template lang="pug">
a-layout.new-layout.new-layout--workspace
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
    :class="hideSidebar ? 'hide-sider' : ''"
  )
    a-layout-sider(style="height: 100%" :width="actualSidebarWidth")
      MetricSidebar(@copyText="handleCopyText" @insertText="handleInsertText")

  a-layout-content.layout-content
    a-card(:bordered="false")
      .query-section.gpt-query-strip
        PromQLEditor(
          ref="promqlEditorRef"
          v-model="currentQuery"
          placeholder="Enter PromQL query"
          :query-loading="queryLoading"
          @query="handleRunQuery"
        )

    a-card.metrics-result-card.gpt-results-pane(:bordered="false")
      .metrics-result-toolbar.gpt-results-toolbar
        .view-switch
          a-button-group
            a-button(
              size="small"
              type="outline"
              :title="$t('dashboard.table')"
              :class="{ active: activeTab === 'table' }"
              @click="setActiveTab('table')"
            )
              svg.icon-16
                use(href="#tableview")
            a-button(
              size="small"
              type="outline"
              :title="$t('dashboard.chart')"
              :class="{ active: activeTab === 'graph' }"
              @click="setActiveTab('graph')"
            )
              svg.icon-16
                use(href="#chart")
          span.gpt-text-toolbar-meta(v-if="activeTab === 'graph' && seriesCount > 0") {{ seriesMetaLabel }}

      .metrics-result-content
        .metrics-table-view(v-show="activeTab === 'table'")
          .section-title
            a-space
              TimezoneInstantPicker(
                v-model="instantQueryTime"
                size="small"
                placeholder="Evaluation time"
                allow-clear
                style="width: 210px"
              )

          .table-section.gpt-table-panel
            DataTable(
              :data="tableData"
              :columns="tableColumns"
              :loading="queryLoading"
              :show-context-menu="false"
              :enable-cell-expand="false"
              :pagination="false"
              :bordered="false"
              :show-header="false"
              :scroll="{ x: 800 }"
            )
              template(#column-series="{ record }")
                .series-cell
                  | {{ record.metricName }}{
                  template(v-if="record.labels && record.labels.length > 0")
                    template(v-for="(label, index) in record.labels" :key="index")
                      strong {{ label.key }}
                      | ="{{ label.value }}"
                      span(v-if="index < record.labels.length - 1") ,
                  | }
              template(#column-values="{ record }")
                .values-cell {{ record.values }}

        .metrics-graph-view(v-show="activeTab === 'graph'")
          MetricsChart
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick, provide } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useRoute, useRouter } from 'vue-router'
  import { useStorage } from '@vueuse/core'
  import { useSeries } from '@/hooks/use-series'
  import TimezoneInstantPicker from '@/components/time-select/instant-picker.vue'
  import { Message } from '@arco-design/web-vue'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import DataTable from '@/components/data-table/index.vue'
  import type { MetricsContext } from './types'
  import MetricSidebar from './components/metric-sidebar.vue'
  import PromQLEditor from './components/prom-ql-editor.vue'
  import MetricsChart from './components/metrics-chart.vue'

  defineOptions({
    name: 'Metrics',
  })

  const { t } = useI18n()
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

  const sidebarWidth = useStorage('metrics-sidebar-width', 228)
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
      // Convert Unix timestamp string to Date
      const unixTimestamp = parseInt(instantTime, 10)
      if (!Number.isNaN(unixTimestamp)) {
        instantQueryTime.value = new Date(unixTimestamp * 1000)
      }
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
      // Convert Date to Unix timestamp string for URL
      const unixTimestamp = Math.floor(instantQueryTime.value.getTime() / 1000).toString()
      query.instantTime = unixTimestamp
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
    const minWidth = 180
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

  const tableColumns = [
    { name: 'series', data_type: 'string', title: 'Series', width: 600 },
    { name: 'values', data_type: 'string', title: 'Values', width: 200 },
  ]

  const promqlEditorRef = ref()

  const seriesCount = computed(() => {
    if (activeTab.value === 'graph') {
      return rangeQueryResult.value?.length || 0
    }
    return tableResults.value?.length || 0
  })

  const seriesMetaLabel = computed(() => t('metrics.resultMeta', { count: seriesCount.value, step: currentStep.value }))

  const setActiveTab = (tab: 'table' | 'graph') => {
    activeTab.value = tab
  }

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
      promqlEditorRef.value.replaceEditorContent(text)
    } else {
      currentQuery.value = text.replace(/[\r\n]+/g, ' ').trim()
    }
  }

  onMounted(() => {
    initializeFromQuery()
    nextTick(() => {
      updateQueryParams()
    })
  })

  watch(activeTab, () => {
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
    box-shadow: none !important;
  }

  .section-title {
    .arco-space {
      align-items: center;
    }

    .arco-input-wrapper {
      margin-left: 8px;
    }
  }

  :deep(.arco-table-th) {
    background-color: var(--gpt-bg-panel);
  }

  .table-controls {
    margin-bottom: var(--gpt-gap-xl);
    border-bottom: 1px solid var(--gpt-border-default);

    .arco-space {
      align-items: center;
    }
  }
  .metrics-result-toolbar .view-switch {
    align-items: center;
    gap: var(--gpt-gap-md);
  }

  .metrics-result-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .metrics-graph-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .metrics-table-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .table-section {
    flex: 1;
    min-height: 0;
  }
</style>
