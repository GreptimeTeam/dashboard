import { bareTableName } from '@/utils/sql'
import { buildTraceDetailUnixRange } from '@/utils/trace-detail-time-range'

/**
 * Where a trace's spans are read from: table, database and an optional unix-seconds window
 * (±12h around an anchor timestamp) used for partition pruning.
 */
export interface TraceDetailTarget {
  table: string
  database?: string
  start?: number
  end?: number
}

/** Target for a row click: bare table name + database, window anchored on the row timestamp. */
export function buildTraceDetailTarget(input: {
  table: string
  database?: string
  timestamp?: unknown
}): TraceDetailTarget {
  const range = buildTraceDetailUnixRange(input.timestamp)
  return {
    // Code mode may store a quoted `"db"."table"`; pass the bare name + database.
    table: bareTableName(input.table) || input.table,
    ...(input.database ? { database: input.database } : {}),
    ...(range ? { start: range[0], end: range[1] } : {}),
  }
}

/**
 * A ±12h partition-pruning window from two query values, or `undefined` when either is missing
 * or unusable. Both bounds must be present and finite: `Number('')` is `0` and a hand-edited
 * URL can hold `Infinity`, which would otherwise be interpolated into the SQL verbatim.
 */
function unixRangeFrom(startText: string, endText: string): [number, number] | undefined {
  if (!startText.trim() || !endText.trim()) return undefined
  const start = Number(startText)
  const end = Number(endText)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined
  return [start, end]
}

function firstString(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item : ''
}

/** Query keys of one trace-target drawer: id + where to read it from (+ optional window). */
interface TargetDrawerKeys {
  id: string
  table: string
  db: string
  start: string
  end: string
}

/**
 * Keys are prefixed so they never collide with the list pages' own params (`builderForm`,
 * `timeRange`, ...) nor with each other: the trace drawer and the logs drawer opened from it
 * can be open at the same time.
 */
const TRACE_KEYS: TargetDrawerKeys = {
  id: 'traceId',
  table: 'traceTable',
  db: 'traceDb',
  start: 'traceStart',
  end: 'traceEnd',
}
const TRACE_LOGS_KEYS: TargetDrawerKeys = {
  id: 'logsTraceId',
  table: 'logsTable',
  db: 'logsDb',
  start: 'logsStart',
  end: 'logsEnd',
}

export const TRACE_DRAWER_QUERY_KEYS = Object.values(TRACE_KEYS)
export const TRACE_LOGS_DRAWER_QUERY_KEYS = Object.values(TRACE_LOGS_KEYS)

export interface TraceDrawerState {
  traceId: string
  /**
   * Absent when the caller has no table to point at yet — the logs drawer of a trace whose
   * logs table is not chosen opens anyway and its panel explains why. Such a state cannot be
   * carried by the URL (the target's table is the key), so it only lives for the session.
   */
  target?: TraceDetailTarget
}

function drawerFromQuery(query: Record<string, unknown>, keys: TargetDrawerKeys): TraceDrawerState | undefined {
  const traceId = firstString(query[keys.id]).trim()
  const table = firstString(query[keys.table]).trim()
  if (!traceId || !table) return undefined
  const database = firstString(query[keys.db]).trim()
  const range = unixRangeFrom(firstString(query[keys.start]), firstString(query[keys.end]))
  return {
    traceId,
    target: {
      table,
      ...(database ? { database } : {}),
      ...(range ? { start: range[0], end: range[1] } : {}),
    },
  }
}

function drawerToQuery(
  query: Record<string, unknown>,
  keys: TargetDrawerKeys,
  traceId: string,
  target?: TraceDetailTarget
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...query }
  Object.values(keys).forEach((key) => {
    delete next[key]
  })
  if (!traceId || !target) return next
  next[keys.id] = traceId
  next[keys.table] = target.table
  if (target.database) next[keys.db] = target.database
  if (target.start !== undefined && target.end !== undefined) {
    next[keys.start] = String(target.start)
    next[keys.end] = String(target.end)
  }
  return next
}

/** Trace drawer state in a list page's query string; `undefined` when no drawer is open. */
export function traceDrawerFromQuery(query: Record<string, unknown>): TraceDrawerState | undefined {
  return drawerFromQuery(query, TRACE_KEYS)
}

/** Query with the trace drawer params set (open) or removed (`traceId` empty); other params are kept. */
export function traceDrawerToQuery(
  query: Record<string, unknown>,
  traceId: string,
  target?: TraceDetailTarget
): Record<string, unknown> {
  return drawerToQuery(query, TRACE_KEYS, traceId, target)
}

/** Logs drawer (logs of one trace, opened from the trace drawer) state in the query string. */
export function traceLogsDrawerFromQuery(query: Record<string, unknown>): TraceDrawerState | undefined {
  return drawerFromQuery(query, TRACE_LOGS_KEYS)
}

/** Query with the logs drawer params set (open) or removed (`traceId` empty); other params are kept. */
export function traceLogsDrawerToQuery(
  query: Record<string, unknown>,
  traceId: string,
  target?: TraceDetailTarget
): Record<string, unknown> {
  return drawerToQuery(query, TRACE_LOGS_KEYS, traceId, target)
}
