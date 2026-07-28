/**
 * Snapshot data shape helpers — two phases:
 *
 * - **Export** (`collectFromQueryCache` → `sanitizeTimeSeriesDataForSnapshot`): optional
 *   TimeSeries canonicalization so persisted JSON has stable ms timestamps.
 * - **View** (`snapshotEmbedStore` → `reviveNormalizedQueryData`): required after JSON parse;
 *   restores `Date` fields and normalizes timestamps for TimeSeries, Log, and Trace.
 *
 * Cache data from live Perses is already plugin-normalized (`TimeSeriesData`, etc.). We do not
 * re-run plugin `getTimeSeriesData` transforms here — only JSON-safe revival.
 */
import type { TimeSeriesData, TraceData } from '@perses-dev/core'
import type { LogQueryResult } from '@perses-dev/plugin-system'
import type { NormalizedQueryData } from './types'

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value)
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }
  return new Date(0)
}

function normalizeUnixMs(value: unknown): number {
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return normalizeUnixMs(asNumber)
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
    return 0
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  if (value > 1_000_000_000_000_000) {
    return Math.floor(value / 1_000_000)
  }
  if (value > 1_000_000_000_000) {
    return value
  }
  if (value > 1_000_000_000) {
    return value * 1000
  }
  return value
}

export function reviveTimeSeriesData(data: TimeSeriesData): TimeSeriesData {
  return {
    stepMs: typeof data.stepMs === 'number' ? data.stepMs : undefined,
    timeRange: data.timeRange
      ? {
          start: toDate(data.timeRange.start),
          end: toDate(data.timeRange.end),
        }
      : undefined,
    series: (data.series ?? []).map((series) => ({
      ...series,
      // BarChart/PieChart use formattedName; GreptimeDB series often only set name.
      formattedName: series.formattedName ?? series.name,
      values: (series.values ?? []).map(([timestamp, value]) => [normalizeUnixMs(timestamp), value]),
    })),
  }
}

export function reviveLogQueryResult(data: LogQueryResult): LogQueryResult {
  const timeRange = data.timeRange
    ? {
        start: toDate(data.timeRange.start),
        end: toDate(data.timeRange.end),
      }
    : { start: new Date(0), end: new Date(0) }

  return {
    ...data,
    timeRange,
  }
}

export function reviveTraceData(data: TraceData): TraceData {
  return {
    ...data,
    searchResult: data.searchResult ?? [],
  }
}

/** Export-only: same revival as view, applied at write time for TimeSeries persistence. */
export function sanitizeTimeSeriesDataForSnapshot(data: TimeSeriesData): TimeSeriesData {
  return reviveTimeSeriesData({
    stepMs: data.stepMs,
    timeRange: data.timeRange,
    series: data.series,
  })
}

export function reviveNormalizedQueryData(data: unknown, queryKind: string): NormalizedQueryData | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }

  if (queryKind.includes('TimeSeries') || queryKind.includes('Prometheus')) {
    return reviveTimeSeriesData(data as TimeSeriesData)
  }

  if (queryKind.includes('Log')) {
    return reviveLogQueryResult(data as LogQueryResult)
  }

  if (queryKind.includes('Trace')) {
    return reviveTraceData(data as TraceData)
  }

  return data as NormalizedQueryData
}
