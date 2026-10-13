import { TRACE_ERROR_STATUS_VALUES } from './red-queries'

const ERROR_STATUS_SET = new Set(TRACE_ERROR_STATUS_VALUES.map((value) => value.toLowerCase()))

/** Whether a span status / span_status_code value means error (OTel + greptime_trace_v1). */
export default function isTraceErrorStatus(value: unknown): boolean {
  if (value == null) {
    return false
  }
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) {
    return false
  }
  return ERROR_STATUS_SET.has(normalized)
}
