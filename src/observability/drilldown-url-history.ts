function normalizeQueryValue(value: unknown): string | string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (Array.isArray(value)) {
    return value.map(String)
  }
  return String(value)
}

/** Stable compare for route.query vs built drilldown query. */
export function drilldownQueriesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every(
    (key) => JSON.stringify(normalizeQueryValue(a[key])) === JSON.stringify(normalizeQueryValue(b[key]))
  )
}

/**
 * Virtual detail location id from query, or null for overview.
 * Used for history push decisions and tests.
 */
export function drilldownDetailIdentity(query: Record<string, unknown>): string | null {
  const { metric } = query
  if (typeof metric === 'string' && metric.trim()) {
    return `metric:${metric.trim()}`
  }
  if (query.logsView === 'detail') {
    return 'logs:detail'
  }
  const { logsTraceId } = query
  if (typeof logsTraceId === 'string' && logsTraceId.trim()) {
    return `logsTrace:${logsTraceId.trim()}`
  }
  const { focusTraceId } = query
  if (typeof focusTraceId === 'string' && focusTraceId.trim()) {
    return `trace:${focusTraceId.trim()}`
  }
  return null
}

/**
 * Any meaningful drilldown query change creates a history entry
 * (including query-parameter-only updates) so Back restores prior state.
 * Callers already skip navigation when {@link drilldownQueriesEqual} is true.
 */
export function shouldPushDrilldownHistory(
  prevQuery: Record<string, unknown>,
  nextQuery: Record<string, unknown>
): boolean {
  return !drilldownQueriesEqual(prevQuery, nextQuery)
}
