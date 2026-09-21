import { computed, ref, type Ref } from 'vue'
import { useStorage } from '@vueuse/core'

export type LogsTableColumnMode = 'separate' | 'merged' | 'merged-with-keys'

interface LogsTablePrefsState {
  mergeColumn: Ref<boolean>
  showKeys: Ref<boolean>
  displayedColumnsByTable: Ref<Record<string, string[]>>
  offeredColumnsByTable: Ref<Record<string, string[]>>
  compactRows: Ref<boolean>
}

/**
 * LogsTable display prefs.
 *
 * Single column / show keys / compact rows are transient view tweaks and stay session-only
 * (module state keyed by `storagePrefix`), so the log query page (`logquery`) and the
 * drilldown logs table (`drilldown-logs`) no longer leak into each other through
 * localStorage.
 *
 * Column visibility is the exception: it is opt-in persistent (`persistColumns`), because
 * re-hiding a long column list after every reload is much worse than a stale choice.
 */
const stateByPrefix = new Map<string, LogsTablePrefsState>()

function stateFor(prefix: string, defaultMergeColumn: boolean): LogsTablePrefsState {
  const existing = stateByPrefix.get(prefix)
  if (existing) {
    return existing
  }
  const next: LogsTablePrefsState = {
    mergeColumn: ref(defaultMergeColumn),
    showKeys: ref(true),
    displayedColumnsByTable: ref({}),
    /** Columns already offered on this table. New query columns are shown; user hides stay hidden. */
    offeredColumnsByTable: ref({}),
    compactRows: ref(false),
  }
  stateByPrefix.set(prefix, next)
  return next
}

interface LogsTableColumnState {
  displayedColumnsByTable: Ref<Record<string, string[]>>
  offeredColumnsByTable: Ref<Record<string, string[]>>
}

const columnStateByPrefix = new Map<string, LogsTableColumnState>()

function columnStateFor(prefix: string): LogsTableColumnState {
  const existing = columnStateByPrefix.get(prefix)
  if (existing) {
    return existing
  }
  const next: LogsTableColumnState = {
    displayedColumnsByTable: useStorage<Record<string, string[]>>(`${prefix}-table-column-visible`, {}),
    /** Columns already offered on this table. New query columns are shown; user hides stay hidden. */
    offeredColumnsByTable: useStorage<Record<string, string[]>>(`${prefix}-table-column-offered`, {}),
  }
  columnStateByPrefix.set(prefix, next)
  return next
}

export default function useLogsTablePrefs(options?: {
  storagePrefix?: string
  defaultMergeColumn?: boolean
  /** Persist column visibility (and the "already offered" bookkeeping it needs) across visits. */
  persistColumns?: boolean
}) {
  const prefix = options?.storagePrefix ?? 'logquery'
  const session = stateFor(prefix, options?.defaultMergeColumn ?? true)
  const { mergeColumn, showKeys, compactRows } = session
  // The two column maps travel together: without `offeredColumnsByTable` the "first offer
  // reveals every column" rule would resurrect columns the user hid in an earlier visit.
  const { displayedColumnsByTable, offeredColumnsByTable } = options?.persistColumns ? columnStateFor(prefix) : session
  /** Wrap is session-only — keep the same behavior. */
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
