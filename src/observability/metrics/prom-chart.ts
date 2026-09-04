import type { EChartsOption } from 'echarts'
import formatTimeAxisLabel, { calculateTimeAxisTicks } from '@/utils/chart-time-axis'
import type { MetricKind } from './infer-promql'
import { formatMetricAxisValue } from './panel-stats'
import getSeriesColorByIndex, { SERIES_FILL_OPACITY } from './series-colors'

export interface PromMatrixSeries {
  metric: Record<string, string>
  values: Array<[number, string | number]>
}

export function parsePromMatrix(result: unknown): PromMatrixSeries[] {
  if (!Array.isArray(result)) {
    return []
  }

  return result
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const record = item as { metric?: Record<string, string>; values?: Array<[number, string | number]> }
      const metric = record.metric ?? {}
      const values = Array.isArray(record.values) ? record.values : []
      return { metric, values }
    })
    .filter((item): item is PromMatrixSeries => item !== null)
}

function parsePointValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

export function aggregateSeriesToPoints(series: PromMatrixSeries[]): Array<[number, number | null]> {
  if (!series.length) {
    return []
  }

  if (series.length === 1) {
    return series[0].values.map(([timestamp, value]) => [timestamp, parsePointValue(value)] as [number, number | null])
  }

  const byTimestamp = new Map<number, number[]>()
  series.forEach((item) => {
    item.values.forEach(([timestamp, value]) => {
      const parsed = parsePointValue(value)
      if (parsed === null) {
        return
      }
      const bucket = byTimestamp.get(timestamp) ?? []
      bucket.push(parsed)
      byTimestamp.set(timestamp, bucket)
    })
  })

  return [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([timestamp, values]) => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      return [timestamp, mean] as [number, number | null]
    })
}

function parseLeSortValue(le: string): number {
  if (le === '+Inf') {
    return Number.POSITIVE_INFINITY
  }
  const parsed = parseFloat(le)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function formatBucketLabel(le: string): string {
  if (le === '+Inf') {
    return '+Inf'
  }
  const parsed = parseFloat(le)
  if (!Number.isFinite(parsed)) {
    return le
  }
  if (parsed === 0) {
    return '0'
  }
  if (parsed >= 1) {
    return Number.isInteger(parsed) ? String(parsed) : String(Number(parsed.toPrecision(3)))
  }
  // Grafana-style: 0.005, 0.025, 0.1 — trim trailing zeros
  const fixed = parsed.toPrecision(3)
  return fixed.replace(/\.?0+$/, '')
}

/** Grafana `yMinDisplay` for `le` layout — `"0.0"` when buckets are fractional, else `"0"`. */
function formatHeatmapYMinLabel(buckets: string[]): string {
  const hasFractional = buckets.some((le) => {
    const parsed = parseFloat(le)
    return Number.isFinite(parsed) && parsed > 0 && parsed < 1
  })
  return hasFractional ? '0.0' : '0'
}

function formatHeatmapRateValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  if (value < 0.01) {
    return value.toExponential(2)
  }
  if (value < 10) {
    return Number(value.toPrecision(3)).toString()
  }
  if (value < 1000) {
    return String(Math.round(value))
  }
  return `${(value / 1000).toFixed(1)}k`
}

/** Grafana default `filterValues.le` — hide true zeros / float noise. */
const HEATMAP_FILTER_VALUES_LE = 1e-9

/**
 * Catalog heatmaps: also hide cells below this fraction of series max.
 * Absolute 1e-9 alone still paints a purple wall when every bucket has a tiny rate
 * (Auto(min)≈0.09/s). Grafana screenshots look sparse because those slots are null/≤1e-9.
 * Important: only skip *painting* — keep the full ordinal Y (blank rows), do not drop buckets.
 */
const HEATMAP_RELATIVE_HIDE_RATIO = 0.01

/** Grafana default `cellGap` (css px). */
const HEATMAP_CELL_GAP_PX = 1

/** Panel fill behind gaps — ECharts canvas cannot resolve CSS variables. */
const HEATMAP_CELL_GAP_COLOR = '#ffffff'

/** Grafana Scheme heatmap: linear value→palette mapping (`valuesToFills`). Exponent applies only to Opacity mode. */
function heatmapColorMagnitude(value: number, minValue: number, maxValue: number): number {
  if (maxValue <= minValue) {
    return 0
  }
  return Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)))
}

function heatmapHideLe(maxValue: number): number {
  return Math.max(HEATMAP_FILTER_VALUES_LE, maxValue * HEATMAP_RELATIVE_HIDE_RATIO)
}

/**
 * Cells to paint after Grafana hideLE (+ catalog relative floor).
 * Y-axis still uses the full `le` list — empty rows stay blank.
 */
export function selectVisibleHeatmapCells(cells: Array<[number, number, number]>): Array<[number, number, number]> {
  let maxValue = 0
  cells.forEach(([, , value]) => {
    if (value > maxValue) {
      maxValue = value
    }
  })
  const hideLe = heatmapHideLe(maxValue)
  return cells.filter(([, , value]) => value > hideLe)
}

/** Visible color scale bounds (Auto min / Auto max of painted cells). */
export function resolveHeatmapColorBounds(cells: Array<[number, number, number]>): {
  minValue: number
  maxValue: number
} {
  const visible = selectVisibleHeatmapCells(cells)
  if (!visible.length) {
    return { minValue: 0, maxValue: 0 }
  }
  let minValue = Number.POSITIVE_INFINITY
  let maxValue = 0
  visible.forEach(([, , value]) => {
    minValue = Math.min(minValue, value)
    maxValue = Math.max(maxValue, value)
  })
  return { minValue, maxValue }
}

/** Grafana color legend: Auto(min) … Auto(max) of visible cell values. */
export function formatHeatmapLegendLabels(
  minValue: number,
  maxValue: number
): { low: string; mid: string; high: string } {
  const low = `${formatHeatmapRateValue(minValue)}/s`
  const high = `${formatHeatmapRateValue(maxValue)}/s`
  const mid = `${formatHeatmapRateValue((minValue + maxValue) / 2)}/s`
  return { low, mid, high }
}

export interface HistogramHeatmapData {
  times: number[]
  buckets: string[]
  /** ECharts heatmap tuples: [timeIndex, bucketIndex, value] */
  cells: Array<[number, number, number]>
  minValue: number
  maxValue: number
}

/** Aggregate Prometheus histogram matrix (with `le` label) into heatmap grid data. */
export function aggregateHistogramToHeatmap(series: PromMatrixSeries[]): HistogramHeatmapData {
  const bucketSet = new Set<string>()
  const timeSet = new Set<number>()
  const cumulativeCells = new Map<string, number>()

  series.forEach((item) => {
    const { le } = item.metric
    if (!le) {
      return
    }
    bucketSet.add(le)
    item.values.forEach(([timestamp, value]) => {
      const parsed = parsePointValue(value)
      if (parsed === null) {
        return
      }
      timeSet.add(timestamp)
      const key = `${timestamp}\0${le}`
      cumulativeCells.set(key, (cumulativeCells.get(key) ?? 0) + parsed)
    })
  })

  const times = [...timeSet].sort((left, right) => left - right)
  const buckets = [...bucketSet].sort((left, right) => parseLeSortValue(left) - parseLeSortValue(right))

  if (!times.length || !buckets.length) {
    return { times, buckets, cells: [], minValue: 0, maxValue: 0 }
  }

  // Prometheus `_bucket` series are cumulative; Grafana heatmap displays per-bucket rates.
  const incrementalCells = new Map<string, number>()
  times.forEach((timestamp) => {
    let previous = 0
    buckets.forEach((le) => {
      const cumulative = cumulativeCells.get(`${timestamp}\0${le}`) ?? 0
      const incremental = Math.max(0, cumulative - previous)
      if (incremental > 0) {
        incrementalCells.set(`${timestamp}\0${le}`, incremental)
      }
      previous = cumulative
    })
  })

  let minValue = Number.POSITIVE_INFINITY
  let maxValue = 0
  const cells: Array<[number, number, number]> = []

  times.forEach((timestamp, timeIndex) => {
    buckets.forEach((le, bucketIndex) => {
      const value = incrementalCells.get(`${timestamp}\0${le}`)
      if (value === undefined || value <= 0) {
        return
      }
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
      cells.push([timeIndex, bucketIndex, value])
    })
  })

  if (!cells.length) {
    return { times, buckets, cells: [], minValue: 0, maxValue: 0 }
  }

  return { times, buckets, cells, minValue, maxValue }
}

const AXIS_LABEL_COLOR = 'rgba(71, 52, 96, 0.45)'
const AXIS_LINE_COLOR = 'rgba(71, 52, 96, 0.12)'
const GRID_LINE_COLOR = 'rgba(71, 52, 96, 0.06)'

/** Shared panel chart grid — timeseries & heatmap. */
const PANEL_GRID = { left: 4, right: 8, top: 6, bottom: 22, containLabel: true }

export interface PanelChartAxisOptions {
  plotWidthPx?: number
  /** Query window [startSec, endSec] — axis spans this even if samples start later. */
  timeRange?: [number, number]
}

function resolvePanelTimeWindow(
  dataStartSec: number,
  dataEndSec: number,
  timeRange?: [number, number]
): { startMs: number; endMs: number; spanMs: number } {
  const startMs = (timeRange ? timeRange[0] : dataStartSec) * 1000
  const endMs = (timeRange ? timeRange[1] : dataEndSec) * 1000
  return { startMs, endMs, spanMs: Math.max(0, endMs - startMs) }
}

function buildSharedAxisLabelStyle() {
  return {
    fontSize: 10,
    color: AXIS_LABEL_COLOR,
  }
}

/** Time-axis label rules shared by timeseries (time axis) and heatmap (category). */
function buildSharedTimeAxisLabelOption(spanMs: number, tickIntervalMs: number) {
  return {
    ...buildSharedAxisLabelStyle(),
    hideOverlap: false,
    showMinLabel: true,
    showMaxLabel: false,
    alignMinLabel: 'left' as const,
    formatter: (value: number | string) => formatTimeAxisLabel(Number(value), spanMs, tickIntervalMs),
  }
}

function buildVerticalTickMarkLine(data: Array<{ xAxis: number | string }>) {
  return {
    silent: true,
    symbol: 'none' as const,
    animation: false,
    label: { show: false },
    lineStyle: {
      color: GRID_LINE_COLOR,
      width: 1,
      type: 'solid' as const,
    },
    data,
  }
}

/** Map shared time ticks onto nearest sample indexes (heatmap category axis). */
function resolveTickCategoryIndexes(timesSec: number[], ticksMs: number[]): number[] {
  if (!timesSec.length || !ticksMs.length) {
    return []
  }

  const indexes: number[] = []
  ticksMs.forEach((tickMs) => {
    let bestIndex = 0
    let bestDist = Number.POSITIVE_INFINITY
    timesSec.forEach((sec, index) => {
      const dist = Math.abs(sec * 1000 - tickMs)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    })
    if (!indexes.includes(bestIndex)) {
      indexes.push(bestIndex)
    }
  })
  return indexes
}

/** @deprecated Prefer getSeriesColorByIndex — Grafana colors by list index, not metric kind. */
export function sparklineSeriesColor(kind: MetricKind): string {
  // Keep a stable fallback for callers without a list index (maps kind → palette slot).
  const kindIndex: Record<MetricKind, number> = {
    counter: 0,
    gauge: 2,
    updown_counter: 2,
    histogram: 0,
    summary: 1,
    unknown: 5,
  }
  return getSeriesColorByIndex(kindIndex[kind] ?? 5)
}

export { getSeriesColorByIndex }

function formatSparklineAxisValue(value: number, kind: MetricKind): string {
  return formatMetricAxisValue(value, { kind, forAxis: true })
}

/** Grafana Spectral-like gradient (low → high intensity). */
const HEATMAP_COLORS = [
  '#5e4fa2',
  '#3288bd',
  '#66c2a5',
  '#abdda4',
  '#fee08b',
  '#fdae61',
  '#f46d43',
  '#d53e4f',
  '#9e0142',
]

export function buildHeatmapOption(
  data: HistogramHeatmapData,
  _metricName?: string,
  options?: PanelChartAxisOptions
): EChartsOption {
  const { times, buckets, cells } = data

  const { startMs, endMs, spanMs } = resolvePanelTimeWindow(
    times[0] ?? 0,
    times[times.length - 1] ?? 0,
    options?.timeRange
  )
  const { intervalMs: tickIntervalMs, ticks: timeTicks } = calculateTimeAxisTicks(startMs, endMs, options?.plotWidthPx)
  const tickIndexes = resolveTickCategoryIndexes(times, timeTicks)
  const tickIndexSet = new Set(tickIndexes)
  const categoryTimesMs = times.map((sec) => sec * 1000)

  // Grafana classic PromQL `le` heatmap: one equal-height row per bucket (not an empty
  // synthetic category for yMinDisplay — that tick is a label only in Grafana, and an
  // ECharts category would leave ~1 cell of blank above the x-axis).
  // @see metrics-drilldown buildHeatmapPanel + grafana rowsToCellsHeatmap / heatmapPathsDense
  const yMinLabel = formatHeatmapYMinLabel(buckets)
  const yAxisLabels = buckets.map(formatBucketLabel)
  const significantCells = selectVisibleHeatmapCells(cells)

  let colorMin = Number.POSITIVE_INFINITY
  let colorMax = 0
  significantCells.forEach(([, , value]) => {
    colorMin = Math.min(colorMin, value)
    colorMax = Math.max(colorMax, value)
  })
  if (!Number.isFinite(colorMin)) {
    colorMin = 0
  }

  const colorCells = significantCells.map(([timeIndex, bucketIndex, value]) => [
    timeIndex,
    bucketIndex,
    heatmapColorMagnitude(value, colorMin, colorMax),
    value,
  ])

  return {
    animation: false,
    // Tighter bottom: x labels only — no extra band between cells and the axis line.
    grid: { ...PANEL_GRID, bottom: 18, top: 4 },
    tooltip: {
      trigger: 'item',
      confine: true,
      appendToBody: true,
      borderWidth: 0,
      padding: [6, 8],
      textStyle: { fontSize: 11 },
      formatter: (params: unknown) => {
        const item = params as { data?: [number, number, number, number] }
        const tuple = item.data
        if (!tuple) {
          return ''
        }
        const [timeIndex, yIndex, , rate] = tuple
        const time = formatTimeAxisLabel(categoryTimesMs[timeIndex] ?? 0, spanMs, tickIntervalMs)
        const upper = yAxisLabels[yIndex] ?? ''
        const lower = yIndex > 0 ? yAxisLabels[yIndex - 1] ?? yMinLabel : yMinLabel
        const range = upper === '+Inf' ? `> ${lower}` : `${lower} – ${upper}`
        return `${time}<br/>${range}<br/>${formatHeatmapRateValue(rate)}/s`
      },
    },
    xAxis: {
      type: 'category',
      data: categoryTimesMs,
      boundaryGap: true,
      axisLine: {
        show: true,
        lineStyle: { color: AXIS_LINE_COLOR },
      },
      axisTick: { show: false },
      axisLabel: {
        ...buildSharedTimeAxisLabelOption(spanMs, tickIntervalMs),
        interval: (index: number) => tickIndexSet.has(index),
        margin: 4,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      // Full le set, ScaleDirection.Up: low at bottom → max / +Inf at top.
      data: yAxisLabels,
      inverse: false,
      // Must stay true: ECharts heatmap with boundaryGap:false collapses cell height to 0.
      boundaryGap: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...buildSharedAxisLabelStyle(),
        showMinLabel: true,
        showMaxLabel: true,
        margin: 4,
      },
      splitLine: {
        show: true,
        lineStyle: { color: GRID_LINE_COLOR },
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max: 1,
      dimension: 2,
      inRange: {
        color: HEATMAP_COLORS,
      },
    },
    series: [
      {
        type: 'heatmap',
        data: colorCells,
        itemStyle: {
          borderWidth: HEATMAP_CELL_GAP_PX,
          borderColor: HEATMAP_CELL_GAP_COLOR,
        },
        emphasis: {
          itemStyle: {
            borderColor: 'rgba(71, 52, 96, 0.45)',
            borderWidth: HEATMAP_CELL_GAP_PX,
          },
        },
        markLine: buildVerticalTickMarkLine(tickIndexes.map((index) => ({ xAxis: categoryTimesMs[index] }))),
      },
    ],
  }
}

export function buildSparklineOption(
  points: Array<[number, number | null]>,
  options?: PanelChartAxisOptions & { color?: string; metricKind?: MetricKind }
): EChartsOption {
  const color = options?.color ?? sparklineSeriesColor(options?.metricKind ?? 'unknown')
  const metricKind = options?.metricKind ?? 'unknown'
  const data = points.map(([timestamp, value]) => [timestamp * 1000, value])
  const { startMs, endMs, spanMs } = resolvePanelTimeWindow(
    points[0]?.[0] ?? 0,
    points[points.length - 1]?.[0] ?? 0,
    options?.timeRange
  )
  const { intervalMs: tickIntervalMs, ticks: timeTicks } = calculateTimeAxisTicks(startMs, endMs, options?.plotWidthPx)

  return {
    animation: false,
    grid: { ...PANEL_GRID },
    tooltip: {
      trigger: 'axis',
      confine: true,
      appendToBody: true,
      borderWidth: 0,
      padding: [6, 8],
      textStyle: { fontSize: 11 },
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: 'rgba(112, 47, 237, 0.35)',
          type: 'dashed',
        },
      },
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params]
        const first = items[0] as { axisValue?: number; value?: [number, number | null] } | undefined
        const timeValue = first?.value?.[0] ?? first?.axisValue
        const value = first?.value?.[1]
        if (timeValue === undefined || value === null || value === undefined) {
          return ''
        }
        const time = formatTimeAxisLabel(Number(timeValue), spanMs, tickIntervalMs)
        const formatted = formatSparklineAxisValue(Number(value), metricKind)
        return `${time}<br/><span style="color:${color}">●</span> ${formatted}`
      },
    },
    xAxis: {
      type: 'time',
      show: true,
      boundaryGap: false,
      min: startMs,
      max: endMs,
      minInterval: tickIntervalMs,
      maxInterval: tickIntervalMs,
      interval: tickIntervalMs,
      axisLine: {
        show: true,
        lineStyle: {
          color: AXIS_LINE_COLOR,
        },
      },
      axisTick: {
        show: false,
        customValues: timeTicks,
      },
      axisLabel: {
        ...buildSharedTimeAxisLabelOption(spanMs, tickIntervalMs),
        customValues: timeTicks,
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      type: 'value',
      show: true,
      scale: true,
      splitNumber: 3,
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        ...buildSharedAxisLabelStyle(),
        formatter: (value: number) => formatSparklineAxisValue(Number(value), metricKind),
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: GRID_LINE_COLOR,
        },
      },
    },
    series: [
      {
        type: 'line',
        data,
        smooth: false,
        showSymbol: 'auto',
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 1,
          color,
        },
        itemStyle: {
          color,
          borderColor: color,
          borderWidth: 1,
        },
        // Grafana timeseries fillOpacity: 9
        areaStyle: {
          color,
          opacity: SERIES_FILL_OPACITY,
        },
        connectNulls: false,
        markLine: buildVerticalTickMarkLine(timeTicks.map((timestamp) => ({ xAxis: timestamp }))),
      },
    ],
  }
}
