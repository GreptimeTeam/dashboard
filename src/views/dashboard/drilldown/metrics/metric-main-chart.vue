<template lang="pug">
.metric-main-chart
  .panel-frame(ref="chartContainerRef")
    a-spin.panel-loading(v-if="loading" :loading="true")
    .panel-state.panel-error(v-else-if="error") {{ t('drilldown.metricDetail.chartError') }}
    .panel-state(v-else-if="isEmpty") {{ t('drilldown.metricDetail.chartNoData') }}
    .panel-chart(
      v-else-if="showChart"
      :class="{ 'panel-chart-heatmap': isHeatmap }"
      :title="isHeatmap ? promqlQuery : undefined"
    )
      Chart(:key="chartRenderKey" :height="chartHeight" :options="chartOption")
  .panel-heatmap-legend(v-if="isHeatmap && heatmapLegend")
    span.scale-label.scale-low {{ heatmapLegend.low }}
    .scale-track
      .scale-gradient
      span.scale-label.scale-mid {{ heatmapLegend.mid }}
    span.scale-label.scale-high {{ heatmapLegend.high }}
  .panel-footer(v-if="showQueryLegend")
    .query-legend(:title="promqlQuery")
      span.legend-swatch(:style="{ background: seriesColor }")
      span.legend-name {{ legendLabel }}
    span.series-count(v-if="seriesCount > 1") {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
</template>

<script setup lang="ts">
  import { computed, ref, toRef } from 'vue'
  import { useElementSize } from '@vueuse/core'
  import { useI18n } from 'vue-i18n'
  import Chart from '@/components/raw-chart/index.vue'
  import { useDrilldownContext } from '@/observability/context'
  import { MAIN_CHART_HEIGHT } from '@/observability/metrics/panel-stats'
  import useMetricMainChart from '@/observability/use-metric-main-chart'

  const props = defineProps<{
    metric: string
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
    legendLabel,
    seriesColor,
    isEmpty,
  } = useMetricMainChart(ctx, metricName, plotSize)

  const chartHeight = `${MAIN_CHART_HEIGHT}px`
  const isHeatmap = computed(() => panelType.value === 'heatmap')
  const showQueryLegend = computed(() => Boolean(legendLabel.value) && !isHeatmap.value)
  const showChart = computed(() => Boolean(chartOption.value) && !loading.value && !error.value)
  const chartRenderKey = computed(() => `${props.metric}:${panelType.value}:${promqlQuery.value}`)
</script>

<style scoped lang="less">
  .metric-main-chart {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
  }

  .panel-frame {
    width: 100%;
    min-height: 280px; // MAIN_CHART_HEIGHT (Grafana PANEL_HEIGHT.XL)
  }

  .panel-loading,
  .panel-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 280px;
  }

  .panel-state {
    border: 1px dashed var(--color-border-2);
    border-radius: 6px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .panel-error {
    color: rgb(var(--danger-6));
  }

  .panel-chart {
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 6px;
    background: var(--gpt-bg-panel);
  }

  .panel-heatmap-legend {
    display: grid;
    grid-template-columns: auto minmax(72px, 1fr) auto;
    align-items: center;
    gap: 6px;
    width: min(100%, 320px);
    margin-top: 4px;
    margin-bottom: 2px;
    min-height: 22px;
  }

  .scale-track {
    position: relative;
    min-width: 0;
    height: 10px;
  }

  .scale-gradient {
    width: 100%;
    height: 100%;
    border-radius: 2px;
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

  .scale-label {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 1;
    color: var(--color-text-3);
    white-space: nowrap;
  }

  .scale-mid {
    position: absolute;
    left: 50%;
    top: calc(100% + 2px);
    transform: translateX(-50%);
    font-size: 9px;
  }

  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
  }

  .query-legend {
    display: inline-flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    line-height: 1.2;
    color: var(--color-text-2);
    cursor: default;
  }

  .legend-swatch {
    flex-shrink: 0;
    width: 12px;
    height: 3px;
    border-radius: 1px;
  }

  .legend-name {
    overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .series-count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--color-text-3);
  }
</style>
