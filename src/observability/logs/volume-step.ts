/**
 * Grafana `$__auto` step for log volume bars.
 * @see grafana/grafana packages/grafana-data/src/datetime/rangeutil.ts roundInterval
 */

/** Typical plot width when the chart has not been measured yet. */
export const LOG_VOLUME_FALLBACK_WIDTH_PX = 400

/** Right-side Name/Total legend, subtracted from container width for `$__auto`. */
export const LOG_VOLUME_LEGEND_WIDTH_PX = 112

export function grafanaRoundIntervalMs(interval: number): number {
  switch (true) {
    case interval < 10:
      return 1
    case interval < 15:
      return 10
    case interval < 35:
      return 20
    case interval < 75:
      return 50
    case interval < 150:
      return 100
    case interval < 350:
      return 200
    case interval < 750:
      return 500
    case interval < 1500:
      return 1000
    case interval < 3500:
      return 2000
    case interval < 7500:
      return 5000
    case interval < 12500:
      return 10000
    case interval < 17500:
      return 15000
    case interval < 25000:
      return 20000
    case interval < 45000:
      return 30000
    case interval < 90000:
      return 60000
    case interval < 210000:
      return 120000
    case interval < 450000:
      return 300000
    case interval < 750000:
      return 600000
    case interval < 1050000:
      return 900000
    case interval < 1500000:
      return 1200000
    case interval < 2700000:
      return 1800000
    case interval < 5400000:
      return 3600000
    case interval < 9000000:
      return 7200000
    case interval < 16200000:
      return 10800000
    case interval < 32400000:
      return 21600000
    case interval < 86400000:
      return 43200000
    case interval < 604800000:
      return 86400000
    case interval < 1814400000:
      return 604800000
    case interval < 3628800000:
      return 2592000000
    default:
      return 31536000000
  }
}

/** Smallest positive gap between buckets, in ms. Unix points are seconds. */
export function inferVolumeStepMs(points: Array<[number, number]>): number {
  let stepMs = Number.POSITIVE_INFINITY
  for (let index = 1; index < points.length; index += 1) {
    const gapMs = (points[index][0] - points[index - 1][0]) * 1000
    if (gapMs > 0 && gapMs < stepMs) {
      stepMs = gapMs
    }
  }
  return Number.isFinite(stepMs) ? stepMs : 0
}

/** Y labels inside `containLabel`, not part of the time axis. */
export const VOLUME_AXIS_GUTTER_PX = 36
/** `HH:mm` at 10px plus a gap, so neighboring labels do not collide. */
export const VOLUME_AXIS_LABEL_SLOT_PX = 48

/** How many x-axis times fit in the plot. Narrow charts get fewer than 6. */
export function volumeAxisLabelCount(plotWidthPx: number): number {
  const gridWidth = Math.max(1, plotWidthPx - VOLUME_AXIS_GUTTER_PX)
  return Math.max(2, Math.floor(gridWidth / VOLUME_AXIS_LABEL_SLOT_PX))
}

/**
 * Pixel width of one bucket, not `plotWidth / pointCount`.
 * Sparse rows would otherwise inflate each bar past the next timestamp.
 */
export function volumeBarWidthPx(plotWidthPx: number, spanMs: number, stepMs: number): number {
  const gridWidth = Math.max(1, plotWidthPx - VOLUME_AXIS_GUTTER_PX)
  if (spanMs <= 0 || stepMs <= 0) {
    return 1
  }
  const bucketPx = (gridWidth * stepMs) / spanMs
  return Math.max(1, Math.floor(bucketPx * 0.7))
}

/** Seconds for `date_bin`, matching `count_over_time([$__auto])` step. */
export function grafanaAutoIntervalSeconds(rangeMs: number, plotWidthPx: number): number {
  const width = plotWidthPx > 0 ? plotWidthPx : LOG_VOLUME_FALLBACK_WIDTH_PX
  const stepMs = grafanaRoundIntervalMs(Math.max(0, rangeMs) / Math.max(1, width))
  return Math.max(1, Math.round(stepMs / 1000))
}
