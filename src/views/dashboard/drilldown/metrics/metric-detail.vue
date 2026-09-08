<template lang="pug">
.metric-detail
  MetricMainChart(:metric="metric")

  .metric-detail-actions
    a-space(size="small")
      a-tooltip(mini :content="t('drilldown.metricDetail.comingSoon')")
        a-button(type="outline" size="mini" disabled)
          | {{ t('drilldown.metricDetail.configure') }}
      a-tooltip(mini :content="t('drilldown.metricDetail.comingSoon')")
        a-button(type="outline" size="mini" disabled)
          | {{ t('drilldown.metricDetail.openInPromql') }}
      a-radio-group(
        v-if="isHistogram"
        type="button"
        size="mini"
        disabled
        :model-value="'heatmap'"
      )
        a-radio(value="heatmap") {{ t('drilldown.metricDetail.heatmap') }}
        a-radio(value="percentiles") {{ t('drilldown.metricDetail.percentiles') }}

  a-tabs.metric-detail-tabs(default-active-key="breakdown")
    a-tab-pane(key="breakdown" :title="t('drilldown.metricDetail.breakdownTab')")
      BreakdownGrid(:metric="metric")
    a-tab-pane(key="related-logs" :title="t('drilldown.metricDetail.relatedLogsTab')")
      RelatedLogsPanel
    a-tab-pane(key="related-metrics" :title="t('drilldown.metricDetail.relatedMetricsTab')")
      a-empty(:description="t('drilldown.metricDetail.comingSoon')")
    a-tab-pane(key="query-results" :title="t('drilldown.metricDetail.queryResultsTab')")
      a-empty(:description="t('drilldown.metricDetail.comingSoon')")
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { inferMetricKind } from '@/observability/metrics/infer-promql'
  import BreakdownGrid from './breakdown-grid.vue'
  import MetricMainChart from './metric-main-chart.vue'
  import RelatedLogsPanel from './related-logs-panel.vue'

  const props = defineProps<{
    metric: string
  }>()

  const { t } = useI18n()

  const isHistogram = computed(() => inferMetricKind(props.metric) === 'histogram')
</script>

<style scoped lang="less">
  .metric-detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 12px;
    height: 100%;
    min-height: 0;
    padding: 12px 16px 16px;
    overflow: auto;
  }

  .metric-detail-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .metric-detail-tabs {
    flex: 1;
    min-height: 0;
  }
</style>
