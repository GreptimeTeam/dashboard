/**
 * RED timeseries + list semantics for Traces Drilldown (Phase A).
 * Aggregation follows selectedRedMetric; population is root spans.
 */

import { escapeSqlString, quoteIdent } from '../logs/query-state'

export type RedMetric = 'rate' | 'errors' | 'duration'

/** OTel / greptime_trace_v1 error status values seen in practice. */
export const TRACE_ERROR_STATUS_VALUES = ['STATUS_CODE_ERROR', 'ERROR', 'error'] as const

const TIMESERIES_LIMIT = 200

export function volumeIntervalSecondsFromRange(timeMinutes: number, rangeUnix: number[]): number {
  if (timeMinutes > 0) {
    if (timeMinutes <= 60) return 60
    if (timeMinutes <= 720) return 300
    if (timeMinutes <= 1440) return 900
    return 3600
  }
  if (rangeUnix.length === 2) {
    const start = Number(rangeUnix[0])
    const end = Number(rangeUnix[1])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const diffMinutes = (end - start) / 60
      if (diffMinutes <= 60) return 60
      if (diffMinutes <= 720) return 300
      if (diffMinutes <= 1440) return 900
      return 3600
    }
  }
  return 60
}

export function bucketToUnixSeconds(raw: unknown): number | null {
  if (raw == null) {
    return null
  }
  if (typeof raw === 'string' && raw.includes('T')) {
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  const num = Number(raw)
  if (!Number.isFinite(num)) {
    return null
  }
  if (num > 1e16) {
    return Math.floor(num / 1e9)
  }
  if (num > 1e13) {
    return Math.floor(num / 1e6)
  }
  if (num > 1e11) {
    return Math.floor(num / 1e3)
  }
  return Math.floor(num)
}

/** SQL predicate for error spans (OR of known status literals). */
export function buildErrorStatusPredicate(statusCol: string): string {
  const quoted = quoteIdent(statusCol)
  const parts = TRACE_ERROR_STATUS_VALUES.map((value) => `${quoted} = '${escapeSqlString(value)}'`)
  return `(${parts.join(' OR ')})`
}

export function buildRedMetricExpr(
  metric: RedMetric,
  columns: { status: string; duration: string },
  intervalSeconds: number
): string {
  switch (metric) {
    case 'errors':
      // Error spans per second (Grafana Errors = error rate).
      return `SUM(CASE WHEN ${buildErrorStatusPredicate(columns.status)} THEN 1 ELSE 0 END) * 1.0 / ${intervalSeconds}`
    case 'duration':
      // Seconds so axis/tooltip use Grafana `s` unit (auto ms / s / min).
      return `AVG(${quoteIdent(columns.duration)}) / 1000000000.0`
    case 'rate':
    default:
      // Spans per second.
      return `COUNT(*) * 1.0 / ${intervalSeconds}`
  }
}

/** Grafana-aligned panel unit id for RED sparkline Y-axis / tooltip. */
export function redMetricPanelUnit(metric: RedMetric): string {
  switch (metric) {
    case 'errors':
      return 'ucum:errors/s'
    case 'duration':
      return 's'
    case 'rate':
    default:
      return 'ucum:spans/s'
  }
}

/**
 * Duration heatmap upper bounds in seconds (Grafana Trace Drilldown–style log buckets).
 * Last bucket is +Inf for everything slower.
 */
export const DURATION_HEATMAP_LE_SECONDS = [
  '0.001',
  '0.005',
  '0.01',
  '0.025',
  '0.05',
  '0.1',
  '0.25',
  '0.5',
  '1',
  '2.5',
  '5',
  '10',
  '+Inf',
] as const

/** Nanosecond thresholds matching DURATION_HEATMAP_LE_SECONDS (excluding +Inf). */
const DURATION_HEATMAP_NS_BOUNDS = [
  1_000_000, // 1ms
  5_000_000,
  10_000_000,
  25_000_000,
  50_000_000,
  100_000_000,
  250_000_000,
  500_000_000,
  1_000_000_000,
  2_500_000_000,
  5_000_000_000,
  10_000_000_000,
] as const

/** CASE expression mapping duration_nano → le string (seconds / +Inf). */
export function buildDurationLeCaseExpr(durationColumn: string): string {
  const col = quoteIdent(durationColumn)
  const branches = DURATION_HEATMAP_NS_BOUNDS.map((ns, index) => {
    const le = DURATION_HEATMAP_LE_SECONDS[index]
    return `WHEN ${col} < ${ns} THEN '${le}'`
  })
  return `CASE
  ${branches.join('\n  ')}
  ELSE '+Inf'
END`
}

export interface BuildDurationHeatmapSqlInput {
  tableName: string
  where: string
  timeColumn: string
  durationColumn: string
  intervalSeconds: number
  limit?: number
}

const HEATMAP_ROWS_LIMIT = 2000

export function buildDurationHeatmapSql(input: BuildDurationHeatmapSqlInput): string {
  const limit = input.limit ?? HEATMAP_ROWS_LIMIT
  const leExpr = buildDurationLeCaseExpr(input.durationColumn)
  return `SELECT
  date_bin('${input.intervalSeconds} seconds', ${quoteIdent(input.timeColumn)}) AS time_bucket,
  ${leExpr} AS le,
  COUNT(*) AS bucket_count
FROM ${quoteIdent(input.tableName)}
WHERE ${input.where}
GROUP BY time_bucket, le
ORDER BY time_bucket ASC
LIMIT ${limit}`
}

export interface DurationHeatmapRow {
  timeUnix: number
  le: string
  count: number
}

/** Dense heatmap grid from SQL rows (counts are already per-bucket, not cumulative). */
export function aggregateDurationHeatmapRows(rows: DurationHeatmapRow[]): {
  times: number[]
  buckets: string[]
  cells: Array<[number, number, number]>
  minValue: number
  maxValue: number
} {
  const buckets = [...DURATION_HEATMAP_LE_SECONDS]
  const bucketIndex = new Map(buckets.map((le, index) => [le, index]))
  const timeSet = new Set<number>()
  const cellMap = new Map<string, number>()

  rows.forEach((row) => {
    if (!Number.isFinite(row.timeUnix) || row.count <= 0) {
      return
    }
    if (!bucketIndex.has(row.le)) {
      return
    }
    timeSet.add(row.timeUnix)
    const key = `${row.timeUnix}\0${row.le}`
    cellMap.set(key, (cellMap.get(key) ?? 0) + row.count)
  })

  const times = [...timeSet].sort((a, b) => a - b)
  if (!times.length) {
    return { times: [], buckets, cells: [], minValue: 0, maxValue: 0 }
  }

  let minValue = Number.POSITIVE_INFINITY
  let maxValue = 0
  const cells: Array<[number, number, number]> = []
  times.forEach((timestamp, timeIndex) => {
    buckets.forEach((le, yIndex) => {
      const value = cellMap.get(`${timestamp}\0${le}`)
      if (value === undefined || value <= 0) {
        return
      }
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
      cells.push([timeIndex, yIndex, value])
    })
  })

  if (!cells.length) {
    return { times, buckets, cells: [], minValue: 0, maxValue: 0 }
  }
  return { times, buckets, cells, minValue, maxValue }
}

/** Grafana Trace Drilldown chart kinds for RED panels. */
export function redMetricChartKind(metric: RedMetric): 'bar' | 'heatmap' {
  return metric === 'duration' ? 'heatmap' : 'bar'
}

/** Rate = muted bars; Errors = red bars (Grafana UI reference). */
export function redMetricBarColor(metric: Exclude<RedMetric, 'duration'>, isDark = false): string {
  if (metric === 'errors') {
    return isDark ? '#F2495C' : '#E02F44'
  }
  // Rate: Grafana-style neutral bar (same family as CountChart).
  return isDark ? '#9ca3af' : '#bdc4cd'
}

export interface BuildRedTimeseriesSqlInput {
  tableName: string
  where: string
  timeColumn: string
  statusColumn: string
  durationColumn: string
  metric: RedMetric
  intervalSeconds: number
  limit?: number
}

export function buildRedTimeseriesSql(input: BuildRedTimeseriesSqlInput): string {
  const metricExpr = buildRedMetricExpr(
    input.metric,
    { status: input.statusColumn, duration: input.durationColumn },
    input.intervalSeconds
  )
  const limit = input.limit ?? TIMESERIES_LIMIT
  return `SELECT
  date_bin('${input.intervalSeconds} seconds', ${quoteIdent(input.timeColumn)}) AS time_bucket,
  ${metricExpr} AS metric_value
FROM ${quoteIdent(input.tableName)}
WHERE ${input.where}
GROUP BY time_bucket
ORDER BY time_bucket ASC
LIMIT ${limit}`
}

export function buildRootListOrderAndExtraWhere(
  redMetric: RedMetric,
  columns: { time: string; status: string; duration: string }
): { extraWhere: string[]; orderBy: string } {
  if (redMetric === 'errors') {
    return {
      extraWhere: [buildErrorStatusPredicate(columns.status)],
      orderBy: `${quoteIdent(columns.time)} DESC`,
    }
  }
  if (redMetric === 'duration') {
    return {
      extraWhere: [],
      orderBy: `${quoteIdent(columns.duration)} DESC`,
    }
  }
  return {
    extraWhere: [],
    orderBy: `${quoteIdent(columns.time)} DESC`,
  }
}

/** Ranking aggregate over the full window (no per-bin rate). */
export function buildRedRankExpr(metric: RedMetric, columns: { status: string; duration: string }): string {
  switch (metric) {
    case 'errors':
      return `SUM(CASE WHEN ${buildErrorStatusPredicate(columns.status)} THEN 1 ELSE 0 END)`
    case 'duration':
      return `AVG(${quoteIdent(columns.duration)}) / 1000000000.0`
    case 'rate':
    default:
      return 'COUNT(*)'
  }
}

export interface BuildBreakdownValuesSqlInput {
  tableName: string
  where: string
  groupByColumn: string
  statusColumn: string
  durationColumn: string
  metric: RedMetric
  limit?: number
}

const BREAKDOWN_VALUES_LIMIT = 48

export function buildBreakdownValuesSql(input: BuildBreakdownValuesSqlInput): string {
  const limit = input.limit ?? BREAKDOWN_VALUES_LIMIT
  const rankExpr = buildRedRankExpr(input.metric, {
    status: input.statusColumn,
    duration: input.durationColumn,
  })
  const groupCol = quoteIdent(input.groupByColumn)
  return `SELECT
  ${groupCol} AS attr_value,
  ${rankExpr} AS metric_value
FROM ${quoteIdent(input.tableName)}
WHERE ${input.where}
  AND ${groupCol} IS NOT NULL
GROUP BY ${groupCol}
ORDER BY metric_value DESC
LIMIT ${limit}`
}
