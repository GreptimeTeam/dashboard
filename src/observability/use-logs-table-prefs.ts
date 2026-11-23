import { computed } from 'vue'
import useUiPref from '@/composables/use-ui-pref'
import useTableColumnLayoutPref from './use-table-column-layout-pref'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

/**
 * LogsTable display prefs (global uiConfig).
 *
 * Column visibility + order share one allowlist array (`logsTableColumns`).
 */
export default function useLogsTablePrefs() {
  const mergeColumn = useUiPref('logsTableSingleColumn', false)
  const showKeys = useUiPref('logsTableShowKeys', true)
  const compactRows = useUiPref('logsTableCompactRows', false)
  const wrap = useUiPref('logsTableWrapLines', false)
  const columnsLayout = useTableColumnLayoutPref('logsTableColumns', 'logsTableHiddenColumns', 'logsTableColumnOrder')

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
