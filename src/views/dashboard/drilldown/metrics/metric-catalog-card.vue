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
      :show-footer="Boolean((isHeatmap && heatmapLegend) || legendLabel)"
    )
      template(#footer)
        .drilldown-heatmap-legend(v-if="isHeatmap && heatmapLegend")
          span.drilldown-heatmap-legend__label {{ heatmapLegend.low }}
          .drilldown-heatmap-legend__track
            .drilldown-heatmap-legend__gradient
            span.drilldown-heatmap-legend__label.drilldown-heatmap-legend__label--mid {{ heatmapLegend.mid }}
          span.drilldown-heatmap-legend__label {{ heatmapLegend.high }}
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

  .metric-catalog-card__legend {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: var(--gpt-gap-md);
  }
</style>
