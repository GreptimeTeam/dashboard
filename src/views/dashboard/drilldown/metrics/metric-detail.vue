<template lang="pug">
.metric-detail
  .metric-detail-header
    a-button(type="text" size="small" @click="handleBack")
      | {{ t('drilldown.metricDetail.back') }}
    h3.metric-title {{ metric }}
  a-tabs(default-active-key="breakdown")
    a-tab-pane(key="breakdown" :title="t('drilldown.metricDetail.breakdownTab')")
      BreakdownGrid(:metric="metric")
    a-tab-pane(key="related-logs" :title="t('drilldown.metricDetail.relatedLogsTab')")
      RelatedLogsPanel
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import BreakdownGrid from './breakdown-grid.vue'
  import RelatedLogsPanel from './related-logs-panel.vue'

  const props = defineProps<{
    metric: string
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const handleBack = () => {
    ctx.metric.value = undefined
  }
</script>

<style scoped lang="less">
  .metric-detail {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 12px 16px 16px;
    overflow: auto;
  }

  .metric-detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .metric-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-1);
  }
</style>
