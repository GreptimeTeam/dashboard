import dayjs from 'dayjs'
import type { EChartsOption } from 'echarts'
import formatTimeAxisLabel, {
  TIME_AXIS_INCRS_MS,
  calculateTimeAxisTicks,
  calculateYAxisSplitNumber,
  CATALOG_Y_AXIS_SPLIT_NUMBER,
  generateTimeAxisTicks,
} from '@/utils/chart-time-axis'
import { formatLogCountShort, logLevelColor } from './level-color'
import type { LogVolumeSeries } from './volume-series'
import { inferVolumeStepMs, volumeAxisLabelCount, volumeBarWidthPx } from './volume-step'

const AXIS_LABEL_COLOR = 'rgba(71, 52, 96, 0.45)'
const AXIS_LINE_COLOR = 'rgba(71, 52, 96, 0.12)'
const GRID_LINE_COLOR = 'rgba(71, 52, 96, 0.06)'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Coarsen Grafana ticks until the `HH:mm` labels fit the plot width. */
export function fitVolumeTimeAxisTicks(
  startMs: number,
  endMs: number,
  plotWidthPx?: number
): {
  intervalMs: number
  ticks: number[]
} {
  const width = plotWidthPx && plotWidthPx > 0 ? plotWidthPx : 280
  const maxLabels = volumeAxisLabelCount(width)
  let { intervalMs, ticks } = calculateTimeAxisTicks(startMs, endMs, width)
  while (ticks.length > maxLabels) {
    const current = intervalMs
    const nextIndex = TIME_AXIS_INCRS_MS.findIndex((incr) => incr > current)
    if (nextIndex < 0) {
      break
    }
    intervalMs = TIME_AXIS_INCRS_MS[nextIndex]
    ticks = generateTimeAxisTicks(startMs, endMs, intervalMs)
  }
  return { intervalMs, ticks }
}

/** Within a day, axis and tooltip stay `HH:mm` (four digits), not `HH:mm:ss`. */
export function formatVolumeAxisTime(timestampMs: number, spanMs: number, tickIntervalMs: number): string {
  const parsed = dayjs(timestampMs)
  if (!parsed.isValid()) {
    return ''
  }
  if (spanMs <= ONE_DAY_MS) {
    return parsed.format('HH:mm')
  }
  return formatTimeAxisLabel(timestampMs, spanMs, tickIntervalMs)
}

export default function buildLogVolumeBarsOption(
  seriesList: LogVolumeSeries[],
  options: {
    isDark: boolean
    timeRange?: [number, number]
    plotWidthPx?: number
    plotHeightPx?: number
  }
): EChartsOption {
  const first = seriesList[0]?.points ?? []
  const startSec = options.timeRange?.[0] ?? first[0]?.[0] ?? 0
  const endSec = options.timeRange?.[1] ?? first[first.length - 1]?.[0] ?? startSec
  const startMs = startSec * 1000
  const endMs = endSec * 1000
  const spanMs = Math.max(0, endMs - startMs)
  const { intervalMs: tickIntervalMs, ticks: timeTicks } = fitVolumeTimeAxisTicks(startMs, endMs, options.plotWidthPx)
  const plotWidth = options.plotWidthPx && options.plotWidthPx > 0 ? options.plotWidthPx : 280
  const barWidth = volumeBarWidthPx(plotWidth, spanMs, inferVolumeStepMs(first))

  return {
    animation: false,
    grid: { left: 4, right: 8, top: 6, bottom: 2, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      appendToBody: true,
      borderWidth: 0,
      padding: [6, 8],
      textStyle: { fontSize: 11 },
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as Array<{
          seriesName?: string
          color?: string
          value?: [number, number | null]
          axisValue?: number
        }>
        const timeValue = items[0]?.value?.[0] ?? items[0]?.axisValue
        if (timeValue === undefined) {
          return ''
        }
        const time = formatVolumeAxisTime(Number(timeValue), spanMs, tickIntervalMs)
        const lines = items
          .map((item) => {
            const value = item.value?.[1]
            if (value === null || value === undefined) {
              return null
            }
            const color = item.color ?? '#999'
            const label = item.seriesName ? `${item.seriesName} ` : ''
            return `<span style="color:${color}">●</span> ${label}${formatLogCountShort(Number(value))}`
          })
          .filter(Boolean)
        if (!lines.length) {
          return ''
        }
        return `${time}<br/>${lines.join('<br/>')}`
      },
    },
    xAxis: {
      type: 'time',
      show: true,
      boundaryGap: true,
      min: startMs,
      max: endMs,
      minInterval: tickIntervalMs,
      maxInterval: tickIntervalMs,
      interval: tickIntervalMs,
      axisLine: { show: true, lineStyle: { color: AXIS_LINE_COLOR } },
      axisTick: { show: false, customValues: timeTicks },
      axisLabel: {
        fontSize: 10,
        color: AXIS_LABEL_COLOR,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: false,
        alignMinLabel: 'left',
        customValues: timeTicks,
        formatter:
          spanMs <= ONE_DAY_MS
            ? '{HH}:{mm}'
            : (value: number | string) => formatVolumeAxisTime(Number(value), spanMs, tickIntervalMs),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      show: true,
      scale: false,
      min: 0,
      splitNumber:
        options.plotHeightPx != null ? calculateYAxisSplitNumber(options.plotHeightPx) : CATALOG_Y_AXIS_SPLIT_NUMBER,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontSize: 10,
        color: AXIS_LABEL_COLOR,
        formatter: (value: number) => formatLogCountShort(Number(value)),
      },
      splitLine: { show: true, lineStyle: { color: GRID_LINE_COLOR } },
    },
    series: seriesList.map((series) => ({
      type: 'bar' as const,
      name: series.name,
      stack: 'volume',
      barGap: '-100%',
      barMaxWidth: barWidth,
      barWidth,
      data: series.points.map(([unix, count]) => [unix * 1000, count]),
      itemStyle: { color: logLevelColor(series.name, options.isDark) },
    })),
  }
}
