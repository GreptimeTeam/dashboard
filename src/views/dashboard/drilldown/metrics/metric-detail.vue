<template lang="pug">
.metric-detail(ref="detailScrollRef")
  .metric-detail-main
    MetricMainChart(:metric="metric" @update:result="mainChartResult = $event")

  a-tabs.metric-detail-tabs.panel-tabs(v-model:active-key="activeTab" lazy-load)
    a-tab-pane(key="breakdown" :title="t('drilldown.metricDetail.breakdownTab')")
      BreakdownGrid(:metric="metric" :scroll-root="detailScrollRef")
    a-tab-pane(key="related-logs" destroy-on-hide :title="t('drilldown.metricDetail.relatedLogsTab')")
      RelatedLogsPanel
    a-tab-pane(key="related-metrics" destroy-on-hide :title="t('drilldown.metricDetail.relatedMetricsTab')")
      RelatedMetricsPanel(
        :metric="metric"
        :pool-names="poolNames"
        :loading="poolLoading"
        :error="poolError"
        :truncated="poolTruncated"
      )
    a-tab-pane(key="query-results" destroy-on-hide :title="t('drilldown.metricDetail.queryResultsTab')")
      QueryResultsPanel(:result="mainChartResult")
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { isMetricDetailTab } from '@/observability/types'
  import BreakdownGrid from './breakdown-grid.vue'
  import MetricMainChart, { type MetricMainChartResult } from './metric-main-chart.vue'
  import QueryResultsPanel from './query-results-panel.vue'
  import RelatedLogsPanel from './related-logs-panel.vue'
  import RelatedMetricsPanel from './related-metrics-panel.vue'

  defineProps<{
    metric: string
    poolNames: string[]
    poolLoading: boolean
    poolError: string | null
    poolTruncated: boolean
  }>()

  const { t } = useI18n()
  const { detailTab, setDetailTab } = useDrilldownContext()
  const detailScrollRef = ref<HTMLElement | null>(null)
  const mainChartResult = ref<MetricMainChartResult | null>(null)

  const activeTab = computed({
    get: () => detailTab.value,
    set: (key: string | number) => {
      if (isMetricDetailTab(key)) {
        setDetailTab(key)
      }
    },
  })
</script>

<style scoped lang="less">
  .metric-detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .metric-detail-main {
    flex-shrink: 0;
    padding: 12px 16px 12px;
  }

  .metric-detail-tabs {
    flex: 1;
    min-height: 0;
  }

  // No horizontal padding — panel-tabs nav (Breakdown title bar) stays edge-to-edge.
  .metric-detail-tabs :deep(.arco-tabs-content) {
    padding: 0;
  }

  // Keep pane as the scrollport so height:100% children (Related list) get a real bound.
  .metric-detail-tabs :deep(.arco-tabs-content-item) {
    overflow: auto;
  }
</style>
