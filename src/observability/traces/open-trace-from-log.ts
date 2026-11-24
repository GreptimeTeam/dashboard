import { buildTraceDetailTarget, type TraceDetailTarget } from './trace-detail-target'
import { readLastQueryTable, TRACES_QUERY_STORAGE_KEY } from '../query-table-pref'

const TRACE_ID_COLUMN_RE = /^trace_?id$/i

/** The log result column that carries the trace id (physical name, e.g. `trace_id`). */
export function findTraceIdColumn(columns: ReadonlyArray<{ name: string }>): string {
  return columns.find((column) => TRACE_ID_COLUMN_RE.test(column.name))?.name ?? ''
}

/**
 * Where a log row's trace id should be looked up. A log row only *claims* a trace — there is
 * no foreign key — so the target is whatever the Traces Query page queried last: that page
 * publishes the database *and* the table it used (builder or code mode), so the drawer and the
 * page cannot disagree.
 *
 * There is deliberately no fallback here — choosing a table is the query page's job. When the
 * page has not published one yet this returns `undefined` and the caller sends the user there,
 * instead of guessing a table from the database. The log timestamp anchors the ±12h
 * partition-pruning window (log time falls inside the trace's span window). Whether spans
 * really exist is answered by the detail page itself.
 */
export function resolveTraceDetailTarget(logTimestamp?: unknown): TraceDetailTarget | undefined {
  const pick = readLastQueryTable(TRACES_QUERY_STORAGE_KEY)
  if (!pick) {
    return undefined
  }
  return buildTraceDetailTarget({ table: pick.table, database: pick.database, timestamp: logTimestamp })
}
