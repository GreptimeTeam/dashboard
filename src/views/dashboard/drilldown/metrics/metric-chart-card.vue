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
  import { computed, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { inferMetricKind } from '@/observability/metrics/infer-promql'
  import { metricKindLabelKey, METRIC_PANEL_HEIGHT } from '@/observability/metrics/panel-stats'
  import { rememberRecentMetric } from '@/observability/metrics/recent'
  import MetricSparkline from './metric-sparkline.vue'

  const panelHeightPx = `${METRIC_PANEL_HEIGHT}px`

  const props = withDefaults(
    defineProps<{
      metricName: string
      scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>
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
    gap: var(--gpt-gap-md);
    min-height: v-bind(panelHeightPx);
    padding: var(--gpt-gap-lg) var(--gpt-gap-lg) var(--gpt-gap-md);
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-md);
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: var(--gpt-gap-md);
    min-width: 0;
    overflow: hidden;
  }

  .card-title {
    flex: 0 1 auto;
    overflow: hidden;
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-kind {
    flex-shrink: 0;
    font-size: var(--gpt-font-sm);
    font-weight: var(--gpt-font-weight-medium);
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
