/**
 * Fixed maxDataPoints for metrics catalog mini panels.
 * Chosen so Last 30m → ~1m step via Grafana `roundInterval` (30m / 30 = 60s).
 *
 * Note: Grafana metrics-drilldown list panels use QUERY_RESOLUTION.MEDIUM = 250
 * (→ 5s for 30m). Catalog sparklines intentionally use a coarser fixed budget.
 */
export const SPARKLINE_MAX_DATA_POINTS = 30

/**
 * Heatmap catalog panels use fewer X buckets so cells stay wider than tall
 * (horizontal bricks). With ~12 `le` rows in a ~168px-tall card, 30 time columns
 * make ~square tiles; ~15 columns read as horizontal rectangles.
 */
export const HEATMAP_MAX_DATA_POINTS = 15

/**
 * Grafana {@link roundInterval} — snap query interval to human-friendly buckets.
 * @see grafana/packages/grafana-data/src/datetime/rangeutil.ts
 */
export function roundInterval(intervalMs: number): number {
  switch (true) {
    case intervalMs < 10:
      return 1
    case intervalMs < 15:
      return 10
    case intervalMs < 35:
      return 20
    case intervalMs < 75:
      return 50
    case intervalMs < 150:
      return 100
    case intervalMs < 350:
      return 200
    case intervalMs < 750:
      return 500
    case intervalMs < 1500:
      return 1000
    case intervalMs < 3500:
      return 2000
    case intervalMs < 7500:
      return 5000
    case intervalMs < 12500:
      return 10000
    case intervalMs < 17500:
      return 15000
    case intervalMs < 25000:
      return 20000
    case intervalMs < 45000:
      return 30000
    case intervalMs < 90000:
      return 60000
    case intervalMs < 210000:
      return 120000
    case intervalMs < 450000:
      return 300000
    case intervalMs < 750000:
      return 600000
    case intervalMs < 1050000:
      return 900000
    case intervalMs < 1500000:
      return 1200000
    case intervalMs < 2700000:
      return 1800000
    case intervalMs < 5400000:
      return 3600000
    case intervalMs < 9000000:
      return 7200000
    case intervalMs < 16200000:
      return 10800000
    case intervalMs < 32400000:
      return 21600000
    case intervalMs < 86400000:
      return 43200000
    case intervalMs < 604800000:
      return 86400000
    case intervalMs < 1814400000:
      return 604800000
    case intervalMs < 3628800000:
      return 2592000000
    default:
      return 31536000000
  }
}

export interface SparklineStepOptions {
  maxDataPoints?: number
  /** Grafana datasource / panel min step (ms). Default 1ms — no artificial floor. */
  minIntervalMs?: number
}

/**
 * Grafana `calculateInterval`: `roundInterval(timeRange / maxDataPoints)`, optional min-interval floor.
 *
 * @see grafana/packages/grafana-data/src/datetime/rangeutil.ts#calculateInterval
 */
export function calculateSparklineIntervalMs(rangeMs: number, options?: SparklineStepOptions): number {
  const maxDataPoints = options?.maxDataPoints ?? SPARKLINE_MAX_DATA_POINTS
  const minIntervalMs = options?.minIntervalMs ?? 1

  if (rangeMs <= 0) {
    return minIntervalMs
  }

  let intervalMs = roundInterval(rangeMs / maxDataPoints)

  if (minIntervalMs > intervalMs) {
    intervalMs = minIntervalMs
  }

  return intervalMs
}

export function estimateSparklinePointCount(rangeMs: number, intervalMs: number): number {
  if (intervalMs <= 0) {
    return 0
  }
  return Math.floor(rangeMs / intervalMs) + 1
}

export function calculateSparklineQueryStep(unixRange: number[], options?: SparklineStepOptions): string {
  if (unixRange.length !== 2) {
    return '60'
  }

  const [start, end] = unixRange
  const rangeMs = Math.max(0, (end - start) * 1000)
  const intervalMs = calculateSparklineIntervalMs(rangeMs, options)

  return String(Math.max(1, Math.floor(intervalMs / 1000)))
}
