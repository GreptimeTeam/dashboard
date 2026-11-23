import useTableColumnLayoutPref from './use-table-column-layout-pref'

/**
 * Trace table column prefs: one global allowlist (`traceTableColumns`).
 */
export default function useTraceTablePrefs() {
  return useTableColumnLayoutPref('traceTableColumns', 'traceTableHiddenColumns', 'traceTableColumnOrder')
}
