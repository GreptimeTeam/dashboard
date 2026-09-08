<template lang="pug">
.metric-main-chart
  .panel-frame(ref="chartContainerRef")
    a-spin.panel-loading(v-if="loading && !chartOption" :loading="true")
    .panel-state.panel-error(v-else-if="error && !chartOption") {{ t('drilldown.metricDetail.chartError') }}
    .panel-state(v-else-if="isEmpty") {{ t('drilldown.metricDetail.chartNoData') }}
    .panel-chart(
      v-else-if="chartOption"
      :class="{ 'panel-chart-heatmap': isHeatmap }"
      :title="isHeatmap ? promqlQuery : undefined"
    )
      Chart(
        :key="chartRenderKey"
        ref="chartRef"
        :height="chartHeight"
        :options="chartOption"
        :brush-select="false"
        :time-interaction="!isHeatmap"
        :time-window-ms="timeWindowMs"
        @time-range-change="onTimeRangeChange"
      )
      .panel-refresh-mask(v-if="loading")
        a-spin(:loading="true")
  .panel-heatmap-legend(v-if="isHeatmap && heatmapLegend")
    span.scale-label.scale-low {{ heatmapLegend.low }}
    .scale-track
      .scale-gradient
      span.scale-label.scale-mid {{ heatmapLegend.mid }}
    span.scale-label.scale-high {{ heatmapLegend.high }}
  .panel-footer(v-if="showQueryLegend")
    .query-legends
      .query-legend(v-for="item in legendItems" :key="item.label + item.expr" :title="item.expr")
        span.legend-swatch(:style="{ background: item.color }")
        span.legend-name {{ item.label }}
    span.series-count(v-if="seriesCount > 1 && legendItems.length <= 1")
      | {{ t('drilldown.main.seriesCount', { count: seriesCount }) }}
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
  const chartRef = ref<{ getInstance?: () => unknown } | null>(null)
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
    prefs,
  } = useMetricMainChart(ctx, metricName, plotSize)

  const chartHeight = `${MAIN_CHART_HEIGHT}px`
  const isHeatmap = computed(() => panelType.value === 'heatmap')
  const showQueryLegend = computed(() => legendItems.value.length > 0 && !isHeatmap.value)
  const chartRenderKey = computed(
    () => `${props.metric}:${panelType.value}:${prefs.value.agg}:${prefs.value.variant}:${promqlQuery.value}`
  )

  const timeWindowMs = computed(() => {
    const range = ctx.unixTimeRange()
    if (range.length !== 2) {
      return null
    }
    return { fromMs: range[0] * 1000, toMs: range[1] * 1000 }
  })

  /** raw-chart emits unix seconds after Grafana-style pan/zoom commit. */
  const onTimeRangeChange = ([startSec, endSec]: [number, number]) => {
    if (!(endSec > startSec)) {
      return
    }
    ctx.rangeTime.value = [String(startSec), String(endSec)]
    ctx.time.value = 0
    ctx.triggerRefresh()
  }
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
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 6px;
    background: var(--gpt-bg-panel);
  }

  .panel-refresh-mask {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    background: color-mix(in srgb, var(--gpt-bg-panel) 55%, transparent);
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
    min-height: 22px;
    margin-top: 4px;
    padding: 0 2px;
  }

  .query-legends {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    min-width: 0;
  }

  .query-legend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }

  .legend-swatch {
    flex-shrink: 0;
    width: 10px;
    height: 3px;
    border-radius: 1px;
  }

  .legend-name {
    overflow: hidden;
    font-size: 12px;
    line-height: 1.2;
    color: var(--color-text-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .series-count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--color-text-3);
  }
</style>
