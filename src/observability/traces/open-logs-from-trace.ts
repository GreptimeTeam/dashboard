import { buildTraceDetailTarget, type TraceDetailTarget } from './trace-detail-target'
import { getSignalDatabase } from '../signal-database'
import { LOGS_QUERY_STORAGE_KEY, readQueryTable } from '../query-table-pref'
import { resolveSignalTable } from '../semantics'

/**
 * Where the logs of a trace should be read from: the logs table of the per-signal logs
 * database — the one last chosen on the Logs Query page, else the auto-bound one. The span
 * timestamp anchors the ±12h partition-pruning window (a span's logs are emitted around it).
 * Whether logs really exist is answered by the drawer itself.
 * Returns `undefined` when the logs database has no table at all.
 */
export default async function resolveTraceLogsDrawerTarget(
  spanTimestamp?: unknown
): Promise<TraceDetailTarget | undefined> {
  const database = getSignalDatabase('logs')
  const preferred = readQueryTable(LOGS_QUERY_STORAGE_KEY, database)
  const table = await resolveSignalTable('logs', { database, preferred })
  if (!table) {
    return undefined
  }
  return buildTraceDetailTarget({ table, database, timestamp: spanTimestamp })
}
