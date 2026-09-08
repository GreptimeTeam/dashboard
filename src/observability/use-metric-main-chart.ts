import { computed, ref, watch, type Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import { executePromQLRange } from '@/api/metrics'
import { useAppStore } from '@/store'
import type { DrilldownContext } from './context'
import { filtersForPromMatch } from './filters'
import {
  inferPromQL,
  inferMetricKind,
  inferPanelType,
  inferPromQLLegendLabel,
  type MetricKind,
  type MetricPanelType,
} from './metrics/infer-promql'
import {
  aggregateHistogramToHeatmap,
  aggregateSeriesToPoints,
  buildHeatmapOption,
  buildSparklineOption,
  formatHeatmapLegendLabels,
  parsePromMatrix,
  resolveHeatmapColorBounds,
  type HistogramHeatmapData,
  type PanelChartAxisOptions,
} from './metrics/prom-chart'
import { MAIN_CHART_FALLBACK_PLOT_WIDTH_PX, MAIN_CHART_HEIGHT } from './metrics/panel-stats'
import getSeriesColorByIndex from './metrics/series-colors'
import breakSparklineGaps from './metrics/sparkline-gaps'
import { calculateSparklineQueryStep, MAIN_CHART_MAX_DATA_POINTS } from './metrics/sparkline-step'

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildMatchersFromFilters(ctx: DrilldownContext): string | undefined {
  const matchers = filtersForPromMatch(ctx.filters.value)
  const parts = Object.entries(matchers).map(([key, value]) => `${key}="${escapePromLabelValue(value)}"`)
  return parts.length ? parts.join(',') : undefined
}

export interface MetricMainChartPlotSize {
  width: number
  height: number
}

type CachedMainChart =
  | {
      kind: 'timeseries'
      points: Array<[number, number | null]>
      timeRange: [number, number]
      name: string
    }
  | {
      kind: 'heatmap'
      heatmap: HistogramHeatmapData
      timeRange: [number, number]
      name: string
    }

/**
 * Eager detail main chart (Grafana MetricGraphScene):
 * - Same PromQL as catalog (`inferPromQL`) but QUERY_RESOLUTION.HIGH (500 points)
 * - Axis tick density from measured plot size (Grafana uPlot-style), not catalog 280×168
 * - No IntersectionObserver / sparkline query queue
 * - Catalog mini uses SPARKLINE_MAX_DATA_POINTS=30 / HEATMAP=15
 */
export default function useMetricMainChart(
  ctx: DrilldownContext,
  metricName: Ref<string>,
  plotSize?: Ref<MetricMainChartPlotSize>
) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const panelType = ref<MetricPanelType>('timeseries')
  const heatmapLegend = ref<{ low: string; mid: string; high: string } | null>(null)
  const metricKind = ref<MetricKind>('unknown')
  const seriesCount = ref(0)
  const cached = ref<CachedMainChart | null>(null)
  let requestVersion = 0

  const { isDark } = storeToRefs(useAppStore())

  const promqlQuery = computed(() => {
    const name = metricName.value.trim()
    if (!name) {
      return ''
    }
    const matchers = buildMatchersFromFilters(ctx)
    return inferPromQL(name, matchers)
  })

  const legendLabel = computed(() => {
    const name = metricName.value.trim()
    if (!name) {
      return ''
    }
    return inferPromQLLegendLabel(name)
  })

  const seriesColor = computed(() => getSeriesColorByIndex(0, isDark.value))

  const isEmpty = computed(() => !loading.value && !error.value && !chartOption.value)

  const resolveAxisOptions = (timeRange: [number, number]): PanelChartAxisOptions => {
    const width = plotSize?.value.width ?? 0
    const height = plotSize?.value.height ?? 0
    return {
      timeRange,
      plotWidthPx: width > 0 ? width : MAIN_CHART_FALLBACK_PLOT_WIDTH_PX,
      plotHeightPx: height > 0 ? height : MAIN_CHART_HEIGHT,
    }
  }

  const applyCachedOption = () => {
    const data = cached.value
    if (!data) {
      chartOption.value = null
      return
    }

    const axis = resolveAxisOptions(data.timeRange)

    if (data.kind === 'heatmap') {
      chartOption.value = buildHeatmapOption(data.heatmap, data.name, axis)
      return
    }

    chartOption.value = buildSparklineOption(data.points, {
      ...axis,
      metricKind: metricKind.value,
      metricName: data.name,
      color: seriesColor.value,
      // Grafana main HIGH density: Auto hides points; ECharts auto still shows → Never
      showPoints: 'never',
    })
  }

  const clearChart = () => {
    cached.value = null
    chartOption.value = null
    seriesCount.value = 0
    heatmapLegend.value = null
  }

  const load = async () => {
    const name = metricName.value.trim()
    if (!name) {
      clearChart()
      error.value = null
      loading.value = false
      return
    }

    const unixRange = ctx.unixTimeRange()
    if (unixRange.length !== 2) {
      clearChart()
      error.value = null
      loading.value = false
      return
    }

    metricKind.value = inferMetricKind(name)
    panelType.value = inferPanelType(name)

    const version = requestVersion + 1
    requestVersion = version
    loading.value = true
    error.value = null

    try {
      const query = promqlQuery.value
      const [start, end] = unixRange
      const step = calculateSparklineQueryStep(unixRange, {
        maxDataPoints: MAIN_CHART_MAX_DATA_POINTS,
      })

      const response = await executePromQLRange(query, String(start), String(end), step)

      if (version !== requestVersion) {
        return
      }

      const series = parsePromMatrix(response.data?.result)
      seriesCount.value = series.length
      const timeRange: [number, number] = [start, end]

      if (panelType.value === 'heatmap') {
        const heatmap = aggregateHistogramToHeatmap(series)
        if (!heatmap.cells.length) {
          clearChart()
          return
        }
        cached.value = { kind: 'heatmap', heatmap, timeRange, name }
        const colorBounds = resolveHeatmapColorBounds(heatmap.cells)
        heatmapLegend.value = formatHeatmapLegendLabels(colorBounds.minValue, colorBounds.maxValue, name)
        applyCachedOption()
        return
      }

      heatmapLegend.value = null

      const stepSeconds = Number(step)
      const points = breakSparklineGaps(aggregateSeriesToPoints(series), stepSeconds)

      if (!points.length) {
        clearChart()
        return
      }

      cached.value = { kind: 'timeseries', points, timeRange, name }
      applyCachedOption()
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error(`Failed to load main chart for ${name}:`, err)
      clearChart()
      error.value = err instanceof Error ? err.message : 'Failed to load chart'
    } finally {
      if (version === requestVersion) {
        loading.value = false
      }
    }
  }

  watch(
    () => [
      metricName.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.refreshKey.value,
      isDark.value,
    ],
    () => {
      load()
    },
    { deep: true, immediate: true }
  )

  // Rebuild axes from cache on resize — no refetch.
  watch(
    () => [plotSize?.value.width ?? 0, plotSize?.value.height ?? 0] as const,
    () => {
      if (cached.value) {
        applyCachedOption()
      }
    }
  )

  return {
    loading,
    error,
    chartOption,
    panelType,
    heatmapLegend,
    metricKind,
    seriesCount,
    promqlQuery,
    legendLabel,
    seriesColor,
    isEmpty,
  }
}
