import { buildTraceDetailTarget, type TraceDetailTarget } from './trace-detail-target'
import { getSignalDatabase } from '../signal-database'
import { readQueryTable, TRACES_QUERY_STORAGE_KEY } from '../query-table-pref'
import { resolveSignalTable } from '../semantics'

const TRACE_ID_COLUMN_RE = /^trace_?id$/i

/** The log result column that carries the trace id (physical name, e.g. `trace_id`). */
export function findTraceIdColumn(columns: ReadonlyArray<{ name: string }>): string {
  return columns.find((column) => TRACE_ID_COLUMN_RE.test(column.name))?.name ?? ''
}

/**
 * Where a log row's trace id should be looked up. A log row only *claims* a trace — there is
 * no foreign key — so the target is the traces table of the per-signal traces database: the
 * one last chosen on the Traces Query page, else the auto-bound one. The log timestamp
 * anchors the ±12h partition-pruning window (log time falls inside the trace's span window).
 * Whether spans really exist is answered by the detail page itself.
 * Returns `undefined` when the traces database has no traces table at all.
 */
export async function resolveTraceDetailTarget(logTimestamp?: unknown): Promise<TraceDetailTarget | undefined> {
  const database = getSignalDatabase('traces')
  const preferred = readQueryTable(TRACES_QUERY_STORAGE_KEY, database)
  const table = await resolveSignalTable('traces', { database, preferred })
  if (!table) {
    return undefined
  }
  return buildTraceDetailTarget({ table, database, timestamp: logTimestamp })
}
