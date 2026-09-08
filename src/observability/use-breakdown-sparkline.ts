import { computed, ref, watch, type Ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { storeToRefs } from 'pinia'
import { executePromQLRange } from '@/api/metrics'
import { useAppStore } from '@/store'
import type { DrilldownContext } from './context'
import { filtersForPromMatch } from './filters'
import { buildBreakdownGroupByExpr, buildBreakdownValueExpr } from './metrics/breakdown-queries'
import resolveMetricMeta from './resolve-metric-meta'
import { type MetricKind } from './metrics/infer-promql'
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

function buildMatchersFromFilters(ctx: DrilldownContext): string | undefined {
  const matchers = filtersForPromMatch(ctx.filters.value)
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
  let requestVersion = 0

  const { isDark } = storeToRefs(useAppStore())
  const valueRef = options.value ?? ref('')

  const isEmpty = computed(() => !loading.value && !error.value && !chartOption.value)

  const load = async () => {
    const name = options.metric.value.trim()
    const labelKey = options.labelKey.value.trim()
    if (!options.enabled.value || !name || !labelKey) {
      return
    }

    if (options.mode.value === 'value' && !valueRef.value) {
      chartOption.value = null
      seriesCount.value = 0
      promqlQuery.value = ''
      return
    }

    const unixRange = ctx.unixTimeRange()
    if (unixRange.length !== 2) {
      chartOption.value = null
      seriesCount.value = 0
      promqlQuery.value = ''
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

      const matchers = buildMatchersFromFilters(ctx)
      const queryOpts = { kind, temporality }
      const query =
        options.mode.value === 'groupBy'
          ? buildBreakdownGroupByExpr(name, labelKey, matchers, queryOpts)
          : buildBreakdownValueExpr(name, labelKey, valueRef.value, matchers, queryOpts)
      promqlQuery.value = query

      const [start, end] = unixRange
      const step = calculateSparklineQueryStep(unixRange, {
        maxDataPoints: BREAKDOWN_MAX_DATA_POINTS,
      })
      const stepSeconds = Number(step)

      const response = await enqueueSparklineQuery(() => executePromQLRange(query, String(start), String(end), step))

      if (version !== requestVersion) {
        return
      }

      const series = parsePromMatrix(response.data?.result)
      seriesCount.value = series.length

      if (!series.length) {
        chartOption.value = null
        return
      }

      const timeRange: [number, number] = [start, end]

      if (options.mode.value === 'groupBy') {
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
        return
      }

      const points = seriesToPoints(series, stepSeconds)
      if (!points.length) {
        chartOption.value = null
        return
      }

      chartOption.value = buildSparklineOption(points, {
        metricKind: kind,
        metricName: name,
        semanticUnit,
        panelUnit,
        timeRange,
        plotHeightPx: BREAKDOWN_CHART_HEIGHT,
        color: getSeriesColorByIndex(0, isDark.value),
      })
    } catch (err) {
      if (version !== requestVersion) {
        return
      }
      console.error(`Failed to load breakdown sparkline for ${name}:`, err)
      chartOption.value = null
      seriesCount.value = 0
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
    isEmpty,
  }
}
