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

/** Target from the standalone detail route's query string (`?table=&database=&start=&end=`). */
export function traceDetailTargetFromQuery(query: Record<string, unknown>): TraceDetailTarget {
  const start = Number(query.start)
  const end = Number(query.end)
  const hasRange = Number.isFinite(start) && Number.isFinite(end) && end >= start
  return {
    table: String(query.table || 'spans'),
    ...(query.database ? { database: String(query.database) } : {}),
    ...(hasRange ? { start, end } : {}),
  }
}

/**
 * Query keys that keep an open trace drawer across a refresh. Prefixed so they never
 * collide with the list pages' own params (`builderForm`, `timeRange`, ...).
 */
export const TRACE_DRAWER_QUERY_KEYS = ['traceId', 'traceTable', 'traceDb', 'traceStart', 'traceEnd'] as const

function firstString(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value
  return typeof item === 'string' ? item : ''
}

/** Drawer state encoded in a list page's query string; `undefined` when no drawer is open. */
export function traceDrawerFromQuery(
  query: Record<string, unknown>
): { traceId: string; target: TraceDetailTarget } | undefined {
  const traceId = firstString(query.traceId).trim()
  const table = firstString(query.traceTable).trim()
  if (!traceId || !table) return undefined
  const database = firstString(query.traceDb).trim()
  const start = Number(firstString(query.traceStart))
  const end = Number(firstString(query.traceEnd))
  const hasRange =
    firstString(query.traceStart) && firstString(query.traceEnd) && Number.isFinite(start) && end >= start
  return {
    traceId,
    target: {
      table,
      ...(database ? { database } : {}),
      ...(hasRange ? { start, end } : {}),
    },
  }
}

/** Query with the drawer params set (open) or removed (`traceId` empty); other params are kept. */
export function traceDrawerToQuery(
  query: Record<string, unknown>,
  traceId: string,
  target?: TraceDetailTarget
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...query }
  TRACE_DRAWER_QUERY_KEYS.forEach((key) => {
    delete next[key]
  })
  if (!traceId || !target) return next
  next.traceId = traceId
  next.traceTable = target.table
  if (target.database) next.traceDb = target.database
  if (target.start !== undefined && target.end !== undefined) {
    next.traceStart = String(target.start)
    next.traceEnd = String(target.end)
  }
  return next
}
