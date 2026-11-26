import { computed, type MaybeRefOrGetter } from 'vue'
import useUiPref from '@/composables/use-ui-pref'
import useTableColumnLayoutPref from './use-table-column-layout-pref'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

/**
 * LogsTable display prefs (global uiConfig).
 *
 * Column visibility + order are stored per table (`logsTableColumns`), so the Logs
 * Query page and the drilldown logs table share one layout per table.
 */
export default function useLogsTablePrefs(tableSource: MaybeRefOrGetter<string> = '') {
  const mergeColumn = useUiPref('logsTableSingleColumn', false)
  const showKeys = useUiPref('logsTableShowKeys', true)
  const compactRows = useUiPref('logsTableCompactRows', false)
  const wrap = useUiPref('logsTableWrapLines', false)
  const columnsLayout = useTableColumnLayoutPref('logsTableColumns', 'logsTableHiddenColumns', tableSource)

  const size = computed<'mini' | 'medium'>(() => (compactRows.value ? 'mini' : 'medium'))

  const columnMode = computed<LogsTableColumnMode>(() => {
    if (!mergeColumn.value) {
      return 'separate'
    }
    return showKeys.value ? 'merged-with-keys' : 'merged'
  })

  const columnModeKey = computed(() => columnMode.value)

  return {
    mergeColumn,
    showKeys,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    ...columnsLayout,
  }
}
