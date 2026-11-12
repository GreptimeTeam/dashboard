import { computed } from 'vue'
import useUiPref from '@/composables/use-ui-pref'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

/**
 * LogsTable display prefs.
 *
 * All of these are global UI preferences stored in `uiConfig`, so the Logs Query page
 * and the drilldown logs table share them and they survive reloads: single column,
 * show keys, compact rows, wrap, and the set of hidden columns.
 *
 * Hidden columns are a flat list of column names, not a per-table snapshot: names
 * missing from the current schema are simply ignored.
 */
export default function useLogsTablePrefs() {
  // Global display mode: false means multiple columns (the default), true is the
  // merged single-column view. `showKeys` only applies to the merged mode.
  const mergeColumn = useUiPref('logsTableSingleColumn', false)
  const showKeys = useUiPref('logsTableShowKeys', true)
  const compactRows = useUiPref('logsTableCompactRows', false)
  const wrap = useUiPref('logsTableWrapLines', false)
  const hiddenColumns = useUiPref<string[]>('logsTableHiddenColumns', [])

  const size = computed<'mini' | 'medium'>(() => (compactRows.value ? 'mini' : 'medium'))

  const columnMode = computed<LogsTableColumnMode>(() => {
    if (!mergeColumn.value) {
      return 'separate'
    }
    return showKeys.value ? 'merged-with-keys' : 'merged'
  })

  const columnModeKey = computed(() => columnMode.value)

  const hiddenColumnSet = computed(() => new Set(hiddenColumns.value))

  function isColumnHidden(name: string): boolean {
    return hiddenColumnSet.value.has(name)
  }

  /** Hidden names that actually exist in the given table. */
  function hiddenColumnsFor(columnNames: string[]): string[] {
    return columnNames.filter((name) => hiddenColumnSet.value.has(name))
  }

  /** Visible names for the given table; unknown hidden names are ignored. */
  function visibleColumnsFor(columnNames: string[]): string[] {
    return columnNames.filter((name) => !hiddenColumnSet.value.has(name))
  }

  /**
   * Replace the current table's hidden columns while preserving hidden names that
   * belong to other tables (the list is global, not per table).
   */
  function setVisibleColumns(columnNames: string[], visible: string[]): void {
    const visibleSet = new Set(visible)
    const otherHidden = hiddenColumns.value.filter((name) => !columnNames.includes(name))
    const nextHidden = columnNames.filter((name) => !visibleSet.has(name))
    hiddenColumns.value = [...new Set([...otherHidden, ...nextHidden])]
  }

  function showAllColumns(columnNames: string[]): void {
    const names = new Set(columnNames)
    hiddenColumns.value = hiddenColumns.value.filter((name) => !names.has(name))
  }

  function hideAllColumns(columnNames: string[]): void {
    hiddenColumns.value = [...new Set([...hiddenColumns.value, ...columnNames])]
  }

  return {
    mergeColumn,
    showKeys,
    hiddenColumns,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    isColumnHidden,
    hiddenColumnsFor,
    visibleColumnsFor,
    setVisibleColumns,
    showAllColumns,
    hideAllColumns,
  }
}
