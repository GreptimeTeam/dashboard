/** A timestamp bound as returned by the data source (seconds, ms, ISO string, SQL expr, etc.). */
export type LogTimeBound = number | string

export type LogTimeRange = {
  start?: LogTimeBound
  end?: LogTimeBound
}

function isLogTimeBoundDefined(value: LogTimeBound | undefined): value is LogTimeBound {
  return value !== undefined && value !== null && value !== ''
}

export type LogTimePaginationIntent = 'replay' | 'older' | 'newer'

/** Normalize row / bound timestamps to epoch ms (sec, ms, us, ns, ISO). */
export function normalizeLogTimeBoundToMs(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return NaN
  }

  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return NaN
  }

  if (numeric < 1e11) {
    return numeric * 1000
  }
  if (numeric < 1e14) {
    return numeric
  }
  if (numeric < 1e17) {
    return numeric / 1000
  }
  return numeric / 1e6
}

export function compareLogTimeBounds(a: LogTimeBound, b: LogTimeBound, toMs: (value: LogTimeBound) => number): number {
  const ams = toMs(a)
  const bms = toMs(b)
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) {
    return NaN
  }
  return ams - bms
}

/**
 * Older: [globalStart, oldestRowOnLeftmostPage] inclusive — same as logs-query Pagination.loadOlder.
 */
export function resolveOlderPageRange(
  global: LogTimeRange,
  oldestBound: LogTimeBound,
  toMs: (value: LogTimeBound) => number
): { valid: boolean; range: LogTimeRange } {
  if (!isLogTimeBoundDefined(oldestBound)) {
    return { valid: false, range: { end: oldestBound } }
  }
  // No global start (Any time): fetch rows older than the current page cursor.
  if (!isLogTimeBoundDefined(global.start)) {
    return {
      valid: true,
      range: { end: oldestBound },
    }
  }
  const cmp = compareLogTimeBounds(oldestBound, global.start, toMs)
  return {
    valid: Number.isFinite(cmp) && cmp > 0,
    range: { start: global.start, end: oldestBound },
  }
}

/**
 * Newer: [newestRowOnRightmostPage, globalEnd] inclusive — same as logs-query Pagination.loadNewer.
 */
export function resolveNewerPageRange(
  global: LogTimeRange,
  newestBound: LogTimeBound,
  toMs: (value: LogTimeBound) => number
): { valid: boolean; range: LogTimeRange } {
  if (!isLogTimeBoundDefined(newestBound)) {
    return { valid: false, range: { start: newestBound } }
  }
  // No global end (Any time): fetch rows newer than the current page cursor.
  if (!isLogTimeBoundDefined(global.end)) {
    return {
      valid: true,
      range: { start: newestBound },
    }
  }
  const cmp = compareLogTimeBounds(newestBound, global.end, toMs)
  return {
    valid: Number.isFinite(cmp) && cmp < 0,
    range: { start: newestBound, end: global.end },
  }
}

/** Replay pill: inclusive [start, end] on row timestamps — same as logs-query loadPage. */
export function resolveReplayPageRange(start: LogTimeBound, end: LogTimeBound): LogTimeRange {
  return { start, end }
}
