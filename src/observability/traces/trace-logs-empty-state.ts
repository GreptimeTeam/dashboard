/**
 * Empty state of the trace→logs panel (`TraceLogsPanel`): the one place that says *why* there
 * are no logs for a trace.
 *
 * Both entry points — the Traces Query page and Signals Explore — open the drawer
 * unconditionally and let the panel explain, so the reason (no logs table bound / no trace-id
 * column / no rows) and its wording are decided here instead of by a guard in each page.
 */

/** Where the panel is used; only the empty text pointing at the page to fix differs. */
export type TraceLogsPanelSource = 'query' | 'explore'

/** Why the panel has nothing to show. */
export type TraceLogsEmptyReason = 'no-table' | 'no-trace-column' | 'no-rows'

const EMPTY_KEYS: Record<TraceLogsPanelSource, Record<TraceLogsEmptyReason, string>> = {
  query: {
    'no-table': 'drilldown.traces.traceLogsNoTable',
    'no-trace-column': 'drilldown.traces.traceLogsNoTraceColumn',
    'no-rows': 'drilldown.traces.traceLogsEmpty',
  },
  explore: {
    'no-table': 'drilldown.traces.traceLogsNoTableExplore',
    'no-trace-column': 'drilldown.traces.traceLogsNoTraceColumnExplore',
    'no-rows': 'drilldown.traces.traceLogsEmptyExplore',
  },
}

export interface TraceLogsEmptyInput {
  /** The panel knows which table to read from. */
  hasTarget: boolean
  /** The bound table exists but has no column holding trace ids. */
  missingTraceColumn: boolean
}

/**
 * Precedence: with no table there is nothing to ask; a table without a trace-id column cannot
 * be filtered by this trace; otherwise the table was asked and returned no rows.
 */
export function traceLogsEmptyReason(input: TraceLogsEmptyInput): TraceLogsEmptyReason {
  if (!input.hasTarget) {
    return 'no-table'
  }
  if (input.missingTraceColumn) {
    return 'no-trace-column'
  }
  return 'no-rows'
}

/** Locale key of the empty text, resolved for the source so the copy can be statically read. */
export function traceLogsEmptyKey(reason: TraceLogsEmptyReason, source: TraceLogsPanelSource = 'query'): string {
  return EMPTY_KEYS[source][reason]
}
