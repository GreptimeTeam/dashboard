/**
 * `greptime_trace_v1` — the trace table model GreptimeDB creates itself.
 *
 * Its column names are a server-side contract, so they live here once and are shared
 * by table discovery, field maps and entity resolution instead of being copied into
 * each of them.
 */
export const TRACE_MODEL_REQUIRED_COLUMNS = [
  'trace_id',
  'parent_span_id',
  'timestamp',
  'span_name',
  'service_name',
] as const

/** Extra columns that mark a fuller greptime_trace_v1 layout. */
export const TRACE_MODEL_BONUS_COLUMNS = ['duration_nano', 'span_id', 'span_status_code', 'span_kind'] as const

/** Column the model guarantees for the `service` identity. */
export const TRACE_MODEL_SERVICE_COLUMN = 'service_name'

/** True when `columns` carries the full required model column set. */
export function isTraceModel(columns: ReadonlySet<string>): boolean {
  return TRACE_MODEL_REQUIRED_COLUMNS.every((column) => columns.has(column))
}
