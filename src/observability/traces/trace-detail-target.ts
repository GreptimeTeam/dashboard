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
