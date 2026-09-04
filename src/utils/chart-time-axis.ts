import dayjs from 'dayjs'

const ONE_SECOND_MS = 1000
const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * uPlot / Grafana default time-axis increments (ms).
 * @see https://github.com/leeoniya/uPlot/blob/master/docs/README.md
 */
export const TIME_AXIS_INCRS_MS = [
  ONE_SECOND_MS,
  5 * ONE_SECOND_MS,
  10 * ONE_SECOND_MS,
  15 * ONE_SECOND_MS,
  30 * ONE_SECOND_MS,
  ONE_MINUTE_MS,
  5 * ONE_MINUTE_MS,
  10 * ONE_MINUTE_MS,
  15 * ONE_MINUTE_MS,
  30 * ONE_MINUTE_MS,
  ONE_HOUR_MS,
  2 * ONE_HOUR_MS,
  3 * ONE_HOUR_MS,
  4 * ONE_HOUR_MS,
  6 * ONE_HOUR_MS,
  8 * ONE_HOUR_MS,
  12 * ONE_HOUR_MS,
  ONE_DAY_MS,
  2 * ONE_DAY_MS,
  3 * ONE_DAY_MS,
  5 * ONE_DAY_MS,
  7 * ONE_DAY_MS,
  10 * ONE_DAY_MS,
  15 * ONE_DAY_MS,
  30 * ONE_DAY_MS,
  60 * ONE_DAY_MS,
  90 * ONE_DAY_MS,
  180 * ONE_DAY_MS,
  365 * ONE_DAY_MS,
] as const

/** Grafana `X_TICK_SPACING_NORMAL` — baseline min CSS px between x ticks. */
export const TIME_AXIS_MIN_TICK_SPACE_PX = 40

/** Grafana `X_TICK_VALUE_GAP` — gap after measured label width. */
export const TIME_AXIS_TICK_VALUE_GAP_PX = 18

/** Typical sparkline plot width after y-axis (4-col card). */
export const SPARKLINE_AXIS_PLOT_WIDTH_PX = 280

export interface TimeAxisTicks {
  intervalMs: number
  ticks: number[]
}

function estimateLabelWidthPx(intervalMs: number, spanMs: number): number {
  // Approx CSS px at ~10px axis font for the formats we emit.
  if (intervalMs < ONE_SECOND_MS) {
    return 64
  }
  if (intervalMs <= ONE_MINUTE_MS) {
    return 48
  }
  if (spanMs > ONE_DAY_MS) {
    return spanMs > ONE_DAY_MS * 7 ? 36 : 68
  }
  return 24 // HH:mm
}

/**
 * Grafana x-axis min tick spacing:
 * max(40, labelWidth + 18), derived from plot width → max tick count.
 * @see grafana-ui UPlotAxisBuilder.calculateSpace
 */
export function calculateTimeAxisMinSpacePx(rangeMs: number, plotWidthPx: number): number {
  const width = Math.max(1, plotWidthPx)
  const provisionalMaxTicks = Math.max(2, width / TIME_AXIS_MIN_TICK_SPACE_PX)
  const provisionalIncr = rangeMs / provisionalMaxTicks
  const labelWidth = estimateLabelWidthPx(provisionalIncr, rangeMs)
  return Math.max(TIME_AXIS_MIN_TICK_SPACE_PX, labelWidth + TIME_AXIS_TICK_VALUE_GAP_PX)
}

/**
 * Smallest nice increment with pixel spacing ≥ minSpace (uPlot getIncrSpace).
 * `incr >= minSpace * range / plotWidth`
 */
export function pickTimeAxisIntervalMs(rangeMs: number, plotWidthPx: number, minSpacePx?: number): number {
  if (rangeMs <= 0) {
    return ONE_MINUTE_MS
  }

  const width = Math.max(1, plotWidthPx)
  const space = minSpacePx ?? calculateTimeAxisMinSpacePx(rangeMs, width)
  const rawMs = (space * rangeMs) / width
  const match = TIME_AXIS_INCRS_MS.find((incr) => incr >= rawMs)
  return match ?? TIME_AXIS_INCRS_MS[TIME_AXIS_INCRS_MS.length - 1]
}

/** Tick timestamps from range start, stepping by `intervalMs`. Drops the end tick to avoid clipping. */
export function generateTimeAxisTicks(startMs: number, endMs: number, intervalMs: number): number[] {
  if (endMs < startMs || intervalMs <= 0) {
    return []
  }

  // Exclude the axis end: a label at max is clipped on the right in ECharts.
  const count = Math.floor((endMs - startMs) / intervalMs)
  if (count <= 0) {
    return [startMs]
  }
  return Array.from({ length: count }, (_, index) => startMs + index * intervalMs)
}

export function calculateTimeAxisTicks(
  startMs: number,
  endMs: number,
  plotWidthPx: number = SPARKLINE_AXIS_PLOT_WIDTH_PX
): TimeAxisTicks {
  const rangeMs = Math.max(0, endMs - startMs)
  const intervalMs = pickTimeAxisIntervalMs(rangeMs, plotWidthPx)
  const ticks = generateTimeAxisTicks(startMs, endMs, intervalMs)
  return { intervalMs, ticks }
}

/**
 * Grafana `formatTime` — format depends on found tick increment (+ range for day-scale).
 * @see grafana-ui UPlotAxisBuilder.formatTime
 */
export default function formatTimeAxisLabel(timestampMs: number, spanMs: number, tickIntervalMs?: number): string {
  const incr = tickIntervalMs ?? Math.max(spanMs / 6, ONE_MINUTE_MS)

  if (incr < ONE_SECOND_MS) {
    return dayjs(timestampMs).format('HH:mm:ss.SSS')
  }
  if (incr <= ONE_MINUTE_MS) {
    return dayjs(timestampMs).format('HH:mm:ss')
  }
  if (spanMs <= ONE_DAY_MS) {
    return dayjs(timestampMs).format('HH:mm')
  }
  if (incr <= ONE_DAY_MS) {
    return dayjs(timestampMs).format('MM-DD HH:mm')
  }
  if (spanMs < 365 * ONE_DAY_MS) {
    return dayjs(timestampMs).format('MM-DD')
  }
  return dayjs(timestampMs).format('YYYY-MM')
}
