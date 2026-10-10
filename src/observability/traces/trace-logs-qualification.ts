import { getTableSemantics, resolveEntityFilterRef } from '../semantics'
import { isTraceModel } from '../semantics/model'
import { sqlJsonGetStringExpr } from '../logs/json-field-keys'
import { quoteIdent } from '../logs/query-state'
import type { EntityColumnRef } from '../semantics/model'
import type { SchemaColumn } from '../logs/field-map'

/**
 * Unified trace-side qualification for "which tables can take part in trace → logs
 * association": not trace-model shaped, not declared as another signal, and filterable
 * by trace (`trace_id`). No column-name guessing — whether a table carries logs is the
 * operator's declaration, never inferred from payload-like columns.
 *
 * The result distinguishes the two consumers:
 * - auto probe: requires `declaredLog` (+ a resolvable service identity);
 * - manual mapping in settings: any qualified table — the user's explicit choice,
 *   no evidence needed beyond `trace_id` for row-level filtering.
 */
export interface TraceLogsTableQualification {
  /**
   * SQL left-hand for the service identity probe. Absent when the table has no
   * resolvable service identity — such tables still support manual mapping (row-level
   * filtering only needs trace_id) but cannot be auto-probed.
   */
  identityExpr?: string
  timeColumn?: string
  /** Declared `signal_type='log'` in table_semantics. Required by the auto probe. */
  declaredLog: boolean
}

export async function qualifyTraceLogsTable(
  table: string,
  columns: SchemaColumn[],
  database: string
): Promise<TraceLogsTableQualification | undefined> {
  const names = new Set(columns.map((column) => column.name))
  if (isTraceModel(names)) {
    return undefined
  }
  const semantics = await getTableSemantics(table, database)
  if (semantics?.signalType && semantics.signalType !== 'log') {
    return undefined
  }
  const declaredLog = semantics?.signalType === 'log'
  if (!names.has('trace_id')) {
    return undefined
  }
  let ref: EntityColumnRef | undefined
  try {
    ref = await resolveEntityFilterRef(table, 'service', { signal: 'logs', columns, database })
  } catch {
    ref = undefined
  }
  let identityExpr: string | undefined
  if (ref && names.has(ref.column)) {
    identityExpr = ref.jsonKey ? sqlJsonGetStringExpr(ref.column, ref.jsonKey) : quoteIdent(ref.column)
  }
  return {
    identityExpr,
    timeColumn: names.has('timestamp') ? 'timestamp' : undefined,
    declaredLog,
  }
}
