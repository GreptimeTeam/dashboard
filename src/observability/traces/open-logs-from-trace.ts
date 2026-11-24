import { buildTraceDetailTarget, type TraceDetailTarget } from './trace-detail-target'
import { LOGS_QUERY_STORAGE_KEY, readLastQueryTable } from '../query-table-pref'

/**
 * Where the logs of a trace should be read from: whatever the Logs Query page queried last.
 * That page publishes the database *and* the table it used (builder or code mode), so the
 * drawer and the page cannot disagree. The span timestamp anchors the ±12h partition-pruning
 * window (a span's logs are emitted around it). Whether logs really exist is answered by the
 * drawer itself.
 *
 * There is deliberately no fallback here — choosing a logs table is the Logs Query page's job.
 * When that page has not published one yet this returns `undefined` and the caller sends the
 * user there, instead of querying an arbitrary table of the database.
 */
export default function resolveTraceLogsDrawerTarget(spanTimestamp?: unknown): TraceDetailTarget | undefined {
  const pick = readLastQueryTable(LOGS_QUERY_STORAGE_KEY)
  if (!pick) {
    return undefined
  }
  return buildTraceDetailTarget({ table: pick.table, database: pick.database, timestamp: spanTimestamp })
}
