import { computed, onMounted, ref } from 'vue'
import { useStorage } from '@vueuse/core'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

/**
 * LogsTable display prefs.
 *
 * Defaults to the historical logquery keys so the log query page keeps its preferences.
 * Other surfaces (the drilldown logs table) pass their own `storagePrefix` to stay
 * independent — a legacy "single column" choice must not collapse the drilldown table to
 * its timestamp column.
 */
export default function useLogsTablePrefs(options?: { storagePrefix?: string; defaultMergeColumn?: boolean }) {
  const prefix = options?.storagePrefix ?? 'logquery'
  const mergeColumn = useStorage(`${prefix}-merge-column`, options?.defaultMergeColumn ?? true)
  const showKeys = useStorage(`${prefix}-show-keys`, true)
  const displayedColumnsByTable = useStorage<Record<string, string[]>>(`${prefix}-table-column-visible`, {})
  /** Columns already offered on this table. New query columns are shown; user hides stay hidden. */
  const offeredColumnsByTable = useStorage<Record<string, string[]>>(`${prefix}-table-column-offered`, {})
  const compactRows = useStorage(`${prefix}-compact-rows`, false)
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

  /**
   * Drilldown queries every schema column. Show a column the first time this table offers it.
   * Hides made after that stay hidden. Log query uses `ensureDisplayedColumns` instead.
   */
  function revealOfferedColumns(tableName: string | undefined, columnNames: string[]) {
    if (!tableName || !columnNames.length) {
      return
    }
    const offered = new Set(offeredColumnsByTable.value[tableName] || [])
    const visible = new Set(displayedColumnsByTable.value[tableName] || [])
    const firstOffer = offered.size === 0
    columnNames.forEach((name) => {
      if (firstOffer || !offered.has(name)) {
        visible.add(name)
      }
    })
    offeredColumnsByTable.value = {
      ...offeredColumnsByTable.value,
      [tableName]: [...columnNames],
    }
    displayedColumnsByTable.value = {
      ...displayedColumnsByTable.value,
      [tableName]: [...visible],
    }
  }

  onMounted(() => {
    if (prefix !== 'logquery') {
      return
    }
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
    revealOfferedColumns,
  }
}
