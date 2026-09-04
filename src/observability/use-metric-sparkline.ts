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
} from './metrics/prom-chart'
import getSeriesColorByIndex from './metrics/series-colors'
import enqueueSparklineQuery from './metrics/sparkline-query-queue'
import { calculateSparklineQueryStep, HEATMAP_MAX_DATA_POINTS } from './metrics/sparkline-step'

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildMatchersFromFilters(ctx: DrilldownContext): string | undefined {
  const matchers = filtersForPromMatch(ctx.filters.value)
  const parts = Object.entries(matchers).map(([key, value]) => `${key}="${escapePromLabelValue(value)}"`)
  return parts.length ? parts.join(',') : undefined
}

export default function useMetricSparkline(
  ctx: DrilldownContext,
  metricName: Ref<string>,
  enabled: Ref<boolean>,
  colorIndex: Ref<number> = ref(0)
) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const panelType = ref<MetricPanelType>('timeseries')
  const heatmapLegend = ref<{ low: string; mid: string; high: string } | null>(null)
  const metricKind = ref<MetricKind>('unknown')
  const seriesCount = ref(0)
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

  // Grafana MetricsList: fixedColorIndex from list position → classic palette[index % 8]
  const seriesColor = computed(() => getSeriesColorByIndex(colorIndex.value, isDark.value))

  const isEmpty = computed(() => !loading.value && !error.value && !chartOption.value)

  const load = async () => {
    const name = metricName.value.trim()
    if (!enabled.value || !name) {
      return
    }

    const unixRange = ctx.unixTimeRange()
    if (unixRange.length !== 2) {
      chartOption.value = null
      seriesCount.value = 0
      heatmapLegend.value = null
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
      // Heatmaps need fewer X buckets so cells stay horizontal bricks in short catalog cards.
      const step = calculateSparklineQueryStep(unixRange, {
        maxDataPoints: panelType.value === 'heatmap' ? HEATMAP_MAX_DATA_POINTS : undefined,
      })

      const response = await enqueueSparklineQuery(() => executePromQLRange(query, String(start), String(end), step))

      if (version !== requestVersion) {
        return
      }

      const series = parsePromMatrix(response.data?.result)
      seriesCount.value = series.length

      if (panelType.value === 'heatmap') {
        const heatmap = aggregateHistogramToHeatmap(series)
        if (!heatmap.cells.length) {
          chartOption.value = null
          heatmapLegend.value = null
          return
        }
        chartOption.value = buildHeatmapOption(heatmap, name, { timeRange: [start, end] })
        const colorBounds = resolveHeatmapColorBounds(heatmap.cells)
        heatmapLegend.value = formatHeatmapLegendLabels(colorBounds.minValue, colorBounds.maxValue)
        return
      }

      heatmapLegend.value = null

      const points = aggregateSeriesToPoints(series)

      if (!points.length) {
        chartOption.value = null
        return
      }

      chartOption.value = buildSparklineOption(points, {
        metricKind: metricKind.value,
        timeRange: [start, end],
        color: seriesColor.value,
      })
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error(`Failed to load sparkline for ${name}:`, err)
      chartOption.value = null
      seriesCount.value = 0
      heatmapLegend.value = null
      error.value = err instanceof Error ? err.message : 'Failed to load chart'
    } finally {
      if (version === requestVersion) {
        loading.value = false
      }
    }
  }

  watch(
    () => [
      enabled.value,
      metricName.value,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.refreshKey.value,
      colorIndex.value,
      isDark.value,
    ],
    () => {
      if (!enabled.value || !metricName.value.trim()) {
        return
      }
      load()
    },
    { deep: true, immediate: true }
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
