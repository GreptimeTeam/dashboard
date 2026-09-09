import { computed, ref, watch, type Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import { executePromQLRange } from '@/api/metrics'
import { useAppStore } from '@/store'
import type { DrilldownContext } from './context'
import { filtersForPromMatch } from './filters'
import { buildBreakdownGroupByExpr, buildBreakdownValueExprs } from './metrics/breakdown-queries'
import resolveMetricMeta from './resolve-metric-meta'
import { type MetricKind } from './metrics/infer-promql'
import useMainChartPrefs from './metrics/main-chart-config'
import { isMetricRateQuery, BREAKDOWN_CHART_HEIGHT } from './metrics/panel-stats'
import { resolveMetricPanelUnit } from './metrics/metric-units'
import {
  aggregateSeriesToPoints,
  buildMainTimeseriesOption,
  buildSparklineOption,
  parsePromMatrix,
  type PromMatrixSeries,
} from './metrics/prom-chart'
import getSeriesColorByIndex from './metrics/series-colors'
import breakSparklineGaps from './metrics/sparkline-gaps'
import enqueueSparklineQuery from './metrics/sparkline-query-queue'
import { BREAKDOWN_MAX_DATA_POINTS, calculateSparklineQueryStep } from './metrics/sparkline-step'

const BREAKDOWN_GROUP_SERIES_CAP = 8

export type BreakdownSparklineMode = 'groupBy' | 'value'

export interface BreakdownSeriesLegend {
  name: string
  color: string
}

export interface UseBreakdownSparklineOptions {
  metric: Ref<string>
  labelKey: Ref<string>
  mode: Ref<BreakdownSparklineMode>
  /** Required when mode === 'value'. */
  value?: Ref<string>
  enabled: Ref<boolean>
}

function escapePromLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildMatchersFromFilters(ctx: DrilldownContext, excludeKey?: string): string | undefined {
  const matchers = filtersForPromMatch(ctx.filters.value, { excludeKey })
  const parts = Object.entries(matchers).map(([key, value]) => `${key}="${escapePromLabelValue(value)}"`)
  return parts.length ? parts.join(',') : undefined
}

function seriesLastAbs(series: PromMatrixSeries): number {
  for (let index = series.values.length - 1; index >= 0; index -= 1) {
    const parsed = parseFloat(String(series.values[index]?.[1]))
    if (Number.isFinite(parsed)) {
      return Math.abs(parsed)
    }
  }
  return 0
}

function pickGroupSeries(series: PromMatrixSeries[]): PromMatrixSeries[] {
  if (series.length <= BREAKDOWN_GROUP_SERIES_CAP) {
    return series
  }
  return [...series]
    .sort((left, right) => seriesLastAbs(right) - seriesLastAbs(left))
    .slice(0, BREAKDOWN_GROUP_SERIES_CAP)
}

function labelForSeries(series: PromMatrixSeries, labelKey: string): string {
  const value = series.metric[labelKey]
  if (value == null || value === '') {
    return '<unspecified>'
  }
  return value
}

function seriesToPoints(series: PromMatrixSeries[], stepSeconds: number): Array<[number, number | null]> {
  return breakSparklineGaps(aggregateSeriesToPoints(series), stepSeconds)
}

export default function useBreakdownSparkline(ctx: DrilldownContext, options: UseBreakdownSparklineOptions) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const chartOption = ref<EChartsOption | null>(null)
  const metricKind = ref<MetricKind>('unknown')
  const seriesCount = ref(0)
  const promqlQuery = ref('')
  const seriesLegends = ref<BreakdownSeriesLegend[]>([])
  const legendLabel = ref('')
  let requestVersion = 0

  const { isDark } = storeToRefs(useAppStore())
  const valueRef = options.value ?? ref('')
  const { prefs } = useMainChartPrefs(options.metric)
  const seriesColor = computed(() => seriesLegends.value[0]?.color ?? getSeriesColorByIndex(0, isDark.value))

  const isEmpty = computed(() => !loading.value && !error.value && !chartOption.value)

  const clearChart = () => {
    chartOption.value = null
    seriesCount.value = 0
    seriesLegends.value = []
    legendLabel.value = ''
    promqlQuery.value = ''
  }

  const load = async () => {
    const name = options.metric.value.trim()
    const labelKey = options.labelKey.value.trim()
    if (!options.enabled.value || !name || !labelKey) {
      return
    }

    if (options.mode.value === 'value' && !valueRef.value) {
      clearChart()
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
      const { kind, semanticUnit, temporality } = meta
      metricKind.value = kind
      const panelUnit = resolveMetricPanelUnit(name, isMetricRateQuery(kind, temporality), { semanticUnit })

      const matchers =
        options.mode.value === 'groupBy'
          ? buildMatchersFromFilters(ctx)
          : // Value card supplies label="value"; drop any existing matcher for the same key
            // so filters + card value never produce contradictory duplicate labels.
            buildMatchersFromFilters(ctx, labelKey)
      const queryOpts = { kind, temporality, agg: prefs.value.agg }

      const [start, end] = unixRange
      const step = calculateSparklineQueryStep(unixRange, {
        maxDataPoints: BREAKDOWN_MAX_DATA_POINTS,
      })
      const stepSeconds = Number(step)
      const timeRange: [number, number] = [start, end]

      if (options.mode.value === 'groupBy') {
        const query = buildBreakdownGroupByExpr(name, labelKey, matchers, queryOpts)
        promqlQuery.value = query
        const response = await enqueueSparklineQuery(() => executePromQLRange(query, String(start), String(end), step))

        if (version !== requestVersion) {
          return
        }

        const series = parsePromMatrix(response.data?.result)
        seriesCount.value = series.length

        if (!series.length) {
          chartOption.value = null
          seriesLegends.value = []
          legendLabel.value = ''
          return
        }

        const selected = pickGroupSeries(series)
        const seriesList = selected
          .map((item, index) => {
            const points = seriesToPoints([item], stepSeconds)
            if (!points.length) {
              return null
            }
            return {
              points,
              name: labelForSeries(item, labelKey),
              color: getSeriesColorByIndex(index, isDark.value),
            }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        if (!seriesList.length) {
          chartOption.value = null
          seriesLegends.value = []
          legendLabel.value = ''
          return
        }

        // Grafana label panels: legend shows series names (label values).
        seriesLegends.value = seriesList.map((item) => ({ name: item.name, color: item.color }))
        legendLabel.value = ''
        chartOption.value = buildMainTimeseriesOption(seriesList, {
          metricKind: kind,
          metricName: name,
          semanticUnit,
          panelUnit,
          timeRange,
          plotHeightPx: BREAKDOWN_CHART_HEIGHT,
          showPoints: 'auto',
        })
        return
      }

      const valueQueries = buildBreakdownValueExprs(name, labelKey, valueRef.value, matchers, queryOpts)
      promqlQuery.value = valueQueries.map((item) => item.expr).join('\n')

      const responses = await Promise.all(
        valueQueries.map((item) =>
          enqueueSparklineQuery(() => executePromQLRange(item.expr, String(start), String(end), step))
        )
      )

      if (version !== requestVersion) {
        return
      }

      const seriesList = valueQueries
        .map((item, index) => {
          const series = parsePromMatrix(responses[index]?.data?.result)
          const points = seriesToPoints(series, stepSeconds)
          if (!points.length) {
            return null
          }
          return {
            points,
            name: item.legend,
            color: getSeriesColorByIndex(index, isDark.value),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      seriesCount.value = seriesList.length

      if (!seriesList.length) {
        chartOption.value = null
        seriesLegends.value = []
        legendLabel.value = ''
        return
      }

      // Grafana value panels: legend shows agg function (avg / sum(rate) / min+max).
      seriesLegends.value = seriesList.map((item) => ({ name: item.name, color: item.color }))
      legendLabel.value = seriesList[0]?.name ?? ''

      if (seriesList.length === 1) {
        chartOption.value = buildSparklineOption(seriesList[0].points, {
          metricKind: kind,
          metricName: name,
          semanticUnit,
          panelUnit,
          timeRange,
          plotHeightPx: BREAKDOWN_CHART_HEIGHT,
          color: seriesList[0].color,
        })
        return
      }

      chartOption.value = buildMainTimeseriesOption(seriesList, {
        metricKind: kind,
        metricName: name,
        semanticUnit,
        panelUnit,
        timeRange,
        plotHeightPx: BREAKDOWN_CHART_HEIGHT,
        showPoints: 'auto',
      })
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error(`Failed to load breakdown sparkline for ${name}:`, err)
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
      options.enabled.value,
      options.metric.value,
      options.labelKey.value,
      options.mode.value,
      valueRef.value,
      prefs.value.agg,
      ctx.filters.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.refreshKey.value,
      isDark.value,
    ],
    () => {
      if (!options.enabled.value || !options.metric.value.trim() || !options.labelKey.value.trim()) {
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
    metricKind,
    seriesCount,
    promqlQuery,
    seriesColor,
    legendLabel,
    seriesLegends,
    isEmpty,
  }
}
