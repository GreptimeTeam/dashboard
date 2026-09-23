<template lang="pug">
.metric-main-chart
  .metric-main-chart__frame(ref="chartContainerRef")
    DrilldownChartPanel(
      :option="chartOption"
      :height="MAIN_CHART_HEIGHT"
      :loading="loading"
      :error="error ? t('drilldown.metricDetail.chartError') : null"
      :unsupported-message="unsupported ? t('drilldown.metricDetail.chartHistogramUnsupported') : null"
      :empty-message="isEmpty ? t('drilldown.metricDetail.chartNoData') : null"
      :render-key="chartRenderKey"
      :keep-chart-while-loading="true"
      :chart-title="isHeatmap ? promqlQuery : undefined"
      :chart-class="{ 'metric-main-chart__chart--heatmap': isHeatmap }"
      :show-footer="Boolean((isHeatmap && heatmapLegend) || showQueryLegend)"
    )
      template(#footer)
        .metric-main-chart__heatmap-legend(v-if="isHeatmap && heatmapLegend")
          span.metric-main-chart__scale-label.metric-main-chart__scale-label--low {{ heatmapLegend.low }}
          .metric-main-chart__scale-track
            .metric-main-chart__scale-gradient
            span.metric-main-chart__scale-label.metric-main-chart__scale-label--mid {{ heatmapLegend.mid }}
          span.metric-main-chart__scale-label.metric-main-chart__scale-label--high {{ heatmapLegend.high }}
        .metric-main-chart__legend-row(v-else-if="showQueryLegend")
          .metric-main-chart__legends
            .drilldown-query-legend(v-for="item in legendItems" :key="item.label + item.expr" :title="item.expr")
              span.drilldown-legend-swatch(:style="{ background: item.color }")
              span.drilldown-legend-name {{ item.label }}
          span.drilldown-series-count(v-if="seriesCount > 1 && legendItems.length <= 1")
            | {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
</template>

<script setup lang="ts">
  import { computed, ref, toRef, watch } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { MAIN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useMetricMainChart, {
    type CachedMainChart,
    type MainChartPanelType,
  } from '@/observability/use-metric-main-chart'
  import DrilldownChartPanel from '../components/drilldown-chart-panel.vue'

  export interface MetricMainChartResult {
    cached: CachedMainChart | null
    loading: boolean
    error: string | null
    panelType: MainChartPanelType
    promqlQuery: string
  }

  const props = defineProps<{
    metric: string
  }>()

  const emit = defineEmits<{
    (e: 'update:result', value: MetricMainChartResult): void
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const metricName = toRef(props, 'metric')
  const chartContainerRef = ref<HTMLElement | null>(null)
  const { width: chartWidth } = useElementSize(chartContainerRef)
  const plotSize = computed(() => ({
    width: chartWidth.value,
    height: MAIN_CHART_HEIGHT,
  }))

  const {
    loading,
    error,
    chartOption,
    panelType,
    heatmapLegend,
    seriesCount,
    promqlQuery,
    legendItems,
    isEmpty,
    unsupported,
    prefs,
    cached,
  } = useMetricMainChart(ctx, metricName, plotSize)

  watch(
    [cached, loading, error, panelType, promqlQuery],
    () => {
      emit('update:result', {
        cached: cached.value,
        loading: loading.value,
        error: error.value,
        panelType: panelType.value,
        promqlQuery: promqlQuery.value,
      })
    },
    { immediate: true, deep: true }
  )

  const isHeatmap = computed(() => panelType.value === 'heatmap')
  const showQueryLegend = computed(() => legendItems.value.length > 0 && !isHeatmap.value)
  const chartRenderKey = computed(
    () => `${props.metric}:${panelType.value}:${prefs.value.agg}:${prefs.value.variant}:${promqlQuery.value}`
  )
</script>

<style scoped lang="less">
  .metric-main-chart {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
  }

  .metric-main-chart__frame {
    width: 100%;
    min-height: 280px;
  }

  .metric-main-chart__chart--heatmap {
    background: var(--gpt-bg-panel);
  }

  .metric-main-chart__heatmap-legend {
    display: grid;
    grid-template-columns: auto minmax(72px, 1fr) auto;
    align-items: center;
    gap: var(--gpt-gap-sm);
    width: min(100%, 320px);
    min-height: 22px;
    margin-top: var(--gpt-gap-xs);
    margin-bottom: var(--gpt-gap-2xs);
  }

  .metric-main-chart__scale-track {
    position: relative;
    min-width: 0;
    height: 10px;
  }

  .metric-main-chart__scale-gradient {
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

  .metric-main-chart__scale-label {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-xs);
    line-height: 1;
    white-space: nowrap;
  }

  .metric-main-chart__scale-label--mid {
    position: absolute;
    top: calc(100% + var(--gpt-gap-2xs));
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--gpt-font-2xs);
  }

  .metric-main-chart__legend-row {
    min-height: 22px;
    padding: 0 var(--gpt-gap-2xs);
  }

  .metric-main-chart__legends {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }
</style>
