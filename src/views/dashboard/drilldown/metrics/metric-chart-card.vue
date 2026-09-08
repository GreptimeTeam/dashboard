<template lang="pug">
.metric-chart-card
  .card-header
    .card-title-row(:title="metricName")
      span.card-title {{ metricName }}
      span.card-kind {{ kindLabel }}
    a-button.card-select(type="outline" size="mini" @click="selectMetric")
      | {{ t('drilldown.main.selectMetric') }}
  .card-body
    MetricSparkline(:metric-name="metricName" :scroll-root="scrollRoot" :color-index="colorIndex")
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { Ref } from 'vue'
  import { useDrilldownContext } from '@/observability/context'
  import { inferMetricKind } from '@/observability/metrics/infer-promql'
  import { metricKindLabelKey, METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import { rememberRecentMetric } from '@/observability/metrics/recent'
  import MetricSparkline from './metric-sparkline.vue'

  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  const props = withDefaults(
    defineProps<{
      metricName: string
      scrollRoot: Ref<HTMLElement | null | undefined>
      /** Grafana MetricsList fixedColorIndex (classic palette index % 8). */
      colorIndex?: number
    }>(),
    { colorIndex: 0 }
  )

  const { t } = useI18n()
  const { metric } = useDrilldownContext()

  const kindLabel = computed(() => t(metricKindLabelKey(inferMetricKind(props.metricName))))

  const selectMetric = () => {
    metric.value = props.metricName
    rememberRecentMetric(props.metricName)
  }
</script>

<style scoped lang="less">
  .metric-chart-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: v-bind(panelHeightPx);
    padding: 12px 12px 10px;
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .card-title {
    flex: 0 1 auto;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-kind {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--color-text-3);
    white-space: nowrap;
  }

  .card-select {
    flex-shrink: 0;
  }

  .card-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
</style>
