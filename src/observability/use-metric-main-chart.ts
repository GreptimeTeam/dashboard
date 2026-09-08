import { computed, ref, watch, type Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import { executePromQLRange } from '@/api/metrics'
import { useAppStore } from '@/store'
import type { DrilldownContext } from './context'
import { filtersForPromMatch } from './filters'
import resolveMetricMeta from './resolve-metric-meta'
import { type MetricKind, type MetricTemporality } from './metrics/infer-promql'
import useMainChartPrefs from './metrics/main-chart-config'
import buildMainChartQueries from './metrics/main-chart-queries'
import { isMetricRateQuery, MAIN_CHART_FALLBACK_PLOT_WIDTH_PX, MAIN_CHART_HEIGHT } from './metrics/panel-stats'
import { resolveMetricPanelUnit } from './metrics/metric-units'
import {
  aggregateHistogramToHeatmap,
  aggregateSeriesToPoints,
  buildHeatmapOption,
  buildMainTimeseriesOption,
  formatHeatmapLegendLabels,
  parsePromMatrix,
  resolveHeatmapColorBounds,
  type HistogramHeatmapData,
  type PanelChartAxisOptions,
} from './metrics/prom-chart'
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

export type MainChartPanelType = 'timeseries' | 'heatmap'

export interface MainChartLegendItem {
  label: string
  color: string
  expr: string
}

type CachedMainChart =
  | {
      kind: 'timeseries'
      series: Array<{ points: Array<[number, number | null]>; legend: string; expr: string }>
      timeRange: [number, number]
      name: string
    }
  | {
      kind: 'heatmap'
      heatmap: HistogramHeatmapData
      timeRange: [number, number]
      name: string
      expr: string
    }

/**
 * Eager detail main chart (Grafana MetricGraphScene):
 * - Configure / variant prefs → PromQL (HIGH 500 points)
 * - Axis tick density from measured plot size
 * - Brush dataZoom writes back via caller
 */
export default function useMetricMainChart(
  ctx: DrilldownContext,
  metricName: Ref<string>,
  plotSize?: Ref<MetricMainChartPlotSize>
) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const panelType = ref<MainChartPanelType>('timeseries')
  const heatmapLegend = ref<{ low: string; mid: string; high: string } | null>(null)
  const metricKind = ref<MetricKind>('unknown')
  const semanticUnit = ref<string | null>(null)
  const temporality = ref<MetricTemporality | null>(null)
  const originalName = ref<string | null>(null)
  const seriesCount = ref(0)
  const legendItems = ref<MainChartLegendItem[]>([])
  const cached = ref<CachedMainChart | null>(null)
  let requestVersion = 0

  const { isDark } = storeToRefs(useAppStore())
  const { prefs } = useMainChartPrefs(metricName)

  const matchers = computed(() => buildMatchersFromFilters(ctx))

  /** First query expr — Open in PromQL / heatmap title. */
  const promqlQuery = ref('')

  const legendLabel = computed(() => legendItems.value[0]?.label ?? '')

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
      chartOption.value = buildHeatmapOption(data.heatmap, data.name, {
        ...axis,
        semanticUnit: semanticUnit.value,
        panelUnit: resolveMetricPanelUnit(data.name, false, { semanticUnit: semanticUnit.value }),
      })
      return
    }

    chartOption.value = buildMainTimeseriesOption(
      data.series.map((item, index) => ({
        points: item.points,
        name: item.legend,
        color: getSeriesColorByIndex(index, isDark.value),
      })),
      {
        ...axis,
        metricKind: metricKind.value,
        metricName: data.name,
        semanticUnit: semanticUnit.value,
        panelUnit: resolveMetricPanelUnit(data.name, isMetricRateQuery(metricKind.value, temporality.value), {
          semanticUnit: semanticUnit.value,
        }),
        showPoints: 'never',
      }
    )
  }

  const clearChart = () => {
    cached.value = null
    chartOption.value = null
    seriesCount.value = 0
    heatmapLegend.value = null
    legendItems.value = []
    promqlQuery.value = ''
    semanticUnit.value = null
    temporality.value = null
    originalName.value = null
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

    const version = requestVersion + 1
    requestVersion = version
    loading.value = true
    error.value = null

    try {
      const meta = await resolveMetricMeta(name)
      if (version !== requestVersion) {
        return
      }

      metricKind.value = meta.kind
      semanticUnit.value = meta.semanticUnit
      temporality.value = meta.temporality
      originalName.value = meta.originalName
      const plan = buildMainChartQueries(name, matchers.value, prefs.value, meta.kind, meta.temporality)
      promqlQuery.value = plan.queries[0]?.expr ?? ''

      if (!plan.queries.length) {
        clearChart()
        error.value = null
        loading.value = false
        return
      }

      panelType.value = plan.panel

      const [start, end] = unixRange
      const step = calculateSparklineQueryStep(unixRange, {
        maxDataPoints: MAIN_CHART_MAX_DATA_POINTS,
      })
      const stepSeconds = Number(step)
      const timeRange: [number, number] = [start, end]

      // Keep chart mounted: shift axis to the committed window immediately (Grafana pan/zoom).
      // Series stay until the new query_range returns — empty regions show until refetch.
      if (cached.value) {
        cached.value = { ...cached.value, timeRange }
        applyCachedOption()
      }

      const responses = await Promise.all(
        plan.queries.map((query) => executePromQLRange(query.expr, String(start), String(end), step))
      )

      if (version !== requestVersion) {
        return
      }

      if (plan.panel === 'heatmap') {
        const series = parsePromMatrix(responses[0]?.data?.result)
        seriesCount.value = series.length
        const heatmap = aggregateHistogramToHeatmap(series)
        if (!heatmap.cells.length) {
          clearChart()
          return
        }
        cached.value = {
          kind: 'heatmap',
          heatmap,
          timeRange,
          name,
          expr: plan.queries[0].expr,
        }
        legendItems.value = [
          {
            label: plan.queries[0].legend,
            color: getSeriesColorByIndex(0, isDark.value),
            expr: plan.queries[0].expr,
          },
        ]
        const colorBounds = resolveHeatmapColorBounds(heatmap.cells)
        heatmapLegend.value = formatHeatmapLegendLabels(
          colorBounds.minValue,
          colorBounds.maxValue,
          name,
          semanticUnit.value
        )
        applyCachedOption()
        return
      }

      heatmapLegend.value = null

      const builtSeries: Array<{ points: Array<[number, number | null]>; legend: string; expr: string }> = []
      let totalRawSeries = 0

      plan.queries.forEach((query, index) => {
        const series = parsePromMatrix(responses[index]?.data?.result)
        totalRawSeries += series.length
        const points = breakSparklineGaps(aggregateSeriesToPoints(series), stepSeconds)
        if (points.length) {
          builtSeries.push({ points, legend: query.legend, expr: query.expr })
        }
      })

      seriesCount.value = totalRawSeries

      if (!builtSeries.length) {
        clearChart()
        return
      }

      cached.value = { kind: 'timeseries', series: builtSeries, timeRange, name }
      legendItems.value = builtSeries.map((item, index) => ({
        label: item.legend,
        color: getSeriesColorByIndex(index, isDark.value),
        expr: item.expr,
      }))
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
      prefs.value.variant,
      prefs.value.agg,
      prefs.value.percentiles.join(','),
    ],
    () => {
      load()
    },
    { deep: true, immediate: true }
  )

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
    originalName,
    seriesCount,
    promqlQuery,
    legendLabel,
    legendItems,
    seriesColor,
    isEmpty,
    prefs,
  }
}
