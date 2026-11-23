import type { MaybeRefOrGetter } from 'vue'
import useTableColumnLayoutPref from './use-table-column-layout-pref'

/**
 * Trace table column prefs: visibility + order are stored per trace table
 * (`traceTableColumns`).
 */
export default function useTraceTablePrefs(tableSource: MaybeRefOrGetter<string> = '') {
  return useTableColumnLayoutPref('traceTableColumns', 'traceTableHiddenColumns', tableSource)
}
