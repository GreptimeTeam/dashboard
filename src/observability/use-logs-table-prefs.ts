import { computed, onMounted, ref } from 'vue'
import { useStorage } from '@vueuse/core'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

/**
 * Shared LogsTable display prefs (logquery results + drilldown detail).
 * Storage keys match historical logquery keys so preferences stay in sync.
 */
export default function useLogsTablePrefs() {
  const mergeColumn = useStorage('logquery-merge-column', true)
  const showKeys = useStorage('logquery-show-keys', true)
  const displayedColumnsByTable = useStorage<Record<string, string[]>>('logquery-table-column-visible', {})
  const compactRows = useStorage('query-table-compact-rows', false)
  /** Wrap is session-only in logquery — keep the same behavior. */
  const wrap = ref(false)

  const size = computed<'mini' | 'medium'>(() => (compactRows.value ? 'mini' : 'medium'))

  const columnMode = computed<LogsTableColumnMode>(() => {
    if (!mergeColumn.value) {
      return 'separate'
    }
    return showKeys.value ? 'merged-with-keys' : 'merged'
  })

  const columnModeKey = computed(() => columnMode.value)

  function displayedColumnsFor(tableName: string | undefined): string[] {
    if (!tableName) {
      return []
    }
    return displayedColumnsByTable.value[tableName] || []
  }

  /** Seed visible columns for a table when unset or empty. */
  function ensureDisplayedColumns(tableName: string | undefined, columnNames: string[]) {
    if (!tableName || !columnNames.length) {
      return
    }
    const current = displayedColumnsByTable.value[tableName]
    if (!current?.length) {
      displayedColumnsByTable.value = {
        ...displayedColumnsByTable.value,
        [tableName]: [...columnNames],
      }
    }
  }

  onMounted(() => {
    if (localStorage.getItem('logquery-table-compact') === 'true' && !compactRows.value) {
      compactRows.value = true
      localStorage.removeItem('logquery-table-compact')
    }
  })

  return {
    mergeColumn,
    showKeys,
    displayedColumnsByTable,
    compactRows,
    wrap,
    size,
    columnMode,
    columnModeKey,
    displayedColumnsFor,
    ensureDisplayedColumns,
  }
}
