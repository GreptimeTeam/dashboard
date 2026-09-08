<template lang="pug">
.metric-detail(ref="detailScrollRef")
  .metric-detail-main
    MetricMainChart(:metric="metric")

  a-tabs.metric-detail-tabs.panel-tabs(default-active-key="breakdown")
    a-tab-pane(key="breakdown" :title="t('drilldown.metricDetail.breakdownTab')")
      BreakdownGrid(:metric="metric" :scroll-root="detailScrollRef")
    a-tab-pane(key="related-logs" :title="t('drilldown.metricDetail.relatedLogsTab')")
      RelatedLogsPanel
    a-tab-pane(key="related-metrics" :title="t('drilldown.metricDetail.relatedMetricsTab')")
      a-empty(:description="t('drilldown.metricDetail.comingSoon')")
    a-tab-pane(key="query-results" :title="t('drilldown.metricDetail.queryResultsTab')")
      a-empty(:description="t('drilldown.metricDetail.comingSoon')")
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import BreakdownGrid from './breakdown-grid.vue'
  import MetricMainChart from './metric-main-chart.vue'
  import RelatedLogsPanel from './related-logs-panel.vue'

  defineProps<{
    metric: string
  }>()

  const { t } = useI18n()
  const detailScrollRef = ref<HTMLElement | null>(null)
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

  .metric-detail-tabs :deep(.arco-tabs-content) {
    padding: 0 16px 16px;
  }

  .metric-detail-tabs :deep(.arco-tabs-content-item) {
    overflow: visible;
  }
</style>
