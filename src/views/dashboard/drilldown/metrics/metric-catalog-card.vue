<template lang="pug">
article.metric-catalog-card.drilldown-card(ref="targetRef")
  .drilldown-card__header
    .drilldown-card__title-row(:title="metricName")
      span.drilldown-card__title {{ metricName }}
      span.drilldown-card__meta {{ kindLabel }}
    a-button(type="outline" size="mini" @click="selectMetric")
      | {{ t('drilldown.main.selectMetric') }}
  .drilldown-card__body
    DrilldownChartPanel(
      :option="chartOption"
      :height="METRIC_PANEL_CHART_HEIGHT"
      :loading="loading || !hasBeenVisible"
      :error="error ? t('drilldown.main.sparklineError') : null"
      :unsupported-message="unsupported ? t('drilldown.main.sparklineUnsupported') : null"
      :empty-message="isEmpty ? t('drilldown.main.sparklineNoData') : null"
      :render-key="chartRenderKey"
      :chart-title="isHeatmap ? promqlQuery : undefined"
      :chart-class="{ 'metric-catalog-card__chart--heatmap': isHeatmap }"
      :show-footer="Boolean((isHeatmap && heatmapLegend) || legendLabel)"
    )
      template(#footer)
        .metric-catalog-card__heatmap-legend(v-if="isHeatmap && heatmapLegend")
          span.metric-catalog-card__scale-label.metric-catalog-card__scale-label--low {{ heatmapLegend.low }}
          .metric-catalog-card__scale-track
            .metric-catalog-card__scale-gradient
            span.metric-catalog-card__scale-label.metric-catalog-card__scale-label--mid {{ heatmapLegend.mid }}
          span.metric-catalog-card__scale-label.metric-catalog-card__scale-label--high {{ heatmapLegend.high }}
        .metric-catalog-card__legend(v-else-if="legendLabel")
          .drilldown-query-legend(:title="promqlQuery")
            span.drilldown-legend-swatch(:style="{ background: seriesColor }")
            span.drilldown-legend-name {{ legendLabel }}
          span.drilldown-series-count(v-if="seriesCount > 1")
            | {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
</template>

<script setup lang="ts">
  import { computed, toRef, type MaybeRefOrGetter } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { inferMetricKind } from '@/observability/semantics'
  import {
    metricKindLabelKey,
    METRIC_PANEL_CHART_HEIGHT,
    METRIC_PANEL_HEIGHT,
  } from '@/observability/metrics/panel-stats'
  import { rememberRecentMetric } from '@/observability/metrics/recent'
  import useLazyPanelQuery from '@/observability/use-lazy-panel-query'
  import useMetricSparkline from '@/observability/use-metric-sparkline'
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

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
  const ctx = useDrilldownContext()
  const { metric } = useDrilldownContext()
  const metricName = toRef(props, 'metricName')
  const colorIndex = computed(() => props.colorIndex ?? 0)
  const { targetRef, hasBeenVisible } = useLazyPanelQuery(props.scrollRoot)

  const {
    loading,
    error,
    chartOption,
    panelType,
    heatmapLegend,
    seriesCount,
    promqlQuery,
    legendLabel,
    seriesColor,
    isEmpty,
    unsupported,
  } = useMetricSparkline(ctx, metricName, hasBeenVisible, colorIndex)

  const kindLabel = computed(() => t(metricKindLabelKey(inferMetricKind(props.metricName))))
  const isHeatmap = computed(() => panelType.value === 'heatmap')
  const chartRenderKey = computed(
    () => `${props.metricName}:${panelType.value}:${promqlQuery.value}:${props.colorIndex ?? 0}`
  )

  const selectMetric = () => {
    metric.value = props.metricName
    rememberRecentMetric(props.metricName)
  }
</script>

<style scoped lang="less">
  .metric-catalog-card {
    min-height: v-bind(panelHeightPx);
  }

  .metric-catalog-card__chart--heatmap {
    background: var(--gpt-bg-panel);
  }

  .metric-catalog-card__heatmap-legend {
    display: grid;
    grid-template-columns: auto minmax(72px, 1fr) auto;
    align-items: center;
    gap: var(--gpt-gap-sm);
    width: min(100%, 280px);
    min-height: 22px;
    margin-top: var(--gpt-gap-2xs);
    margin-bottom: var(--gpt-gap-2xs);
  }

  .metric-catalog-card__scale-track {
    position: relative;
    min-width: 0;
    height: 10px;
  }

  .metric-catalog-card__scale-gradient {
    width: 100%;
    height: 100%;
    border-radius: var(--gpt-radius-xs);
    background: linear-gradient(
      90deg,
      #5e4fa2 0%,
      #3288bd 12%,
      #66c2a5 25%,
      #abdda4 37%,
      #fee08b 50%,
      #fdae61 62%,
      #f46d43 75%,
      #d53e4f 87%,
      #9e0142 100%
    );
  }

  .metric-catalog-card__scale-label {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-xs);
    line-height: 1;
    white-space: nowrap;
  }

  .metric-catalog-card__scale-label--mid {
    position: absolute;
    top: calc(100% + var(--gpt-gap-2xs));
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--gpt-font-2xs);
  }

  .metric-catalog-card__legend {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
  }
</style>
